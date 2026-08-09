const path = require('path');
const fs = require('fs');
const { Client, Authenticator } = require('minecraft-launcher-core');
const auth = require('./auth');
const settingsMod = require('./settings');
const javaMod = require('./java');
const { downloadFile, fetchJson, writeFileAtomic } = require('./download');

/**
 * Game launch pipeline (main process).
 *
 * Layout on disk (inside Electron userData):
 *   minecraft/                  <- shared root: versions, libraries, assets
 *     versions/  libraries/  assets/
 *     forge-installers/         <- cached Forge installer jars
 *     instances/<id>/           <- per-instance game dir (worlds, mods, configs)
 *
 * Sharing the root means a version's jars/assets download once and are
 * SHA1-verified by minecraft-launcher-core on every launch; each instance
 * still gets its own isolated game directory.
 */

const launcher = new Client();
let deps = null; // { app, getWin }
let activeChild = null;
let launchInProgress = false;
const fabricLoadersCache = new Map();
let forgePromosCache = null;

function send(channel, payload) {
  const win = deps?.getWin();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

const setState = (status, detail = '') => send('launcher:state', { status, detail });

const rootDir = () => path.join(deps.app.getPath('userData'), 'minecraft');
const instanceDir = (id) => path.join(rootDir(), 'instances', id);

/** Latest stable Fabric loader for a MC version -> installs its version profile, returns profile name. */
async function resolveFabric(mcVersion, requestedVersion = null) {
  if (!fabricLoadersCache.has(mcVersion)) {
    fabricLoadersCache.set(
      mcVersion,
      await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`)
    );
  }
  const loaders = fabricLoadersCache.get(mcVersion);
  if (!Array.isArray(loaders) || loaders.length === 0) {
    throw new Error(`Fabric does not support Minecraft ${mcVersion}`);
  }
  const selected = requestedVersion
    ? loaders.find((entry) => entry.loader.version === requestedVersion)
    : loaders.find((entry) => entry.loader.stable) ?? loaders[0];
  if (!selected) {
    throw new Error(`Fabric loader ${requestedVersion} is not available for Minecraft ${mcVersion}`);
  }
  const loader = selected.loader.version;

  const name = `fabric-loader-${loader}-${mcVersion}`;
  const jsonPath = path.join(rootDir(), 'versions', name, `${name}.json`);
  if (!fs.existsSync(jsonPath)) {
    setState('preparing', `Installing Fabric loader ${loader}…`);
    const profile = await fetchJson(
      `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loader}/profile/json`
    );
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    writeFileAtomic(jsonPath, JSON.stringify(profile, null, 2));
  }
  return name;
}

/** Recommended (or latest) Forge build for a MC version -> downloads installer jar, returns its path. */
async function resolveForge(mcVersion, requestedVersion = null) {
  let forgeVersion = requestedVersion;
  if (!forgeVersion) {
    if (!forgePromosCache) {
      forgePromosCache = await fetchJson(
        'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
      );
    }
    forgeVersion =
      forgePromosCache.promos[`${mcVersion}-recommended`] ??
      forgePromosCache.promos[`${mcVersion}-latest`];
  }
  if (!forgeVersion) {
    throw new Error(`Forge does not support Minecraft ${mcVersion}`);
  }

  const full = forgeVersion.startsWith(`${mcVersion}-`)
    ? forgeVersion
    : `${mcVersion}-${forgeVersion}`;
  const jarPath = path.join(rootDir(), 'forge-installers', `forge-${full}-installer.jar`);
  if (!fs.existsSync(jarPath)) {
    setState('preparing', `Downloading Forge ${forgeVersion}…`);
    const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`;
    await downloadFile(url, jarPath, {
      retries: 3,
      onProgress: ({ percent, retrying, attempt }) => {
        const detail = `Downloading Forge ${forgeVersion}${retrying ? ` — retry ${attempt}` : ''}`;
        setState('downloading', detail);
        if (percent !== null) send('launcher:progress', { percent, detail });
      }
    });
  }
  return jarPath;
}

async function launch({ instance, account }) {
  if (activeChild || launchInProgress) {
    setState('error', activeChild ? 'The game is already running.' : 'A launch is already in progress.');
    return;
  }

  launchInProgress = true;
  try {
  const settings = settingsMod.get();

  // resolve the right Java for this MC version (auto-download if needed)
  let javaPath;
  try {
    javaPath = await javaMod.ensureJava(instance.version, {
      setState,
      sendProgress: (p) => send('launcher:progress', p)
    });
  } catch (err) {
    setState('error', `Java setup failed: ${err.message}`);
    return;
  }

  // Microsoft account when signed in, offline auth otherwise
  let authorization = null;
  if (account?.useMicrosoft) {
    setState('preparing', 'Refreshing Microsoft account…');
    authorization = await auth.getMclcAuth();
    if (!authorization) {
      setState('error', 'Microsoft session expired — please sign in again.');
      return;
    }
  }

  const opts = {
    root: rootDir(),
    version: { number: instance.version, type: 'release' },
    memory: { min: `${settings.memory.min}G`, max: `${settings.memory.max}G` },
    window: {
      width: settings.resolution.width,
      height: settings.resolution.height,
      fullscreen: settings.resolution.fullscreen
    },
    overrides: { gameDirectory: instanceDir(instance.id) },
    authorization: authorization ?? Authenticator.getAuth(account?.username || 'Player'),
    javaPath
  };

  try {
    if (instance.loader === 'Fabric') {
      setState('preparing', 'Resolving Fabric…');
      opts.version.custom = await resolveFabric(instance.version, instance.loaderVersion);
    } else if (instance.loader === 'Forge') {
      setState('preparing', 'Resolving Forge…');
      opts.forge = await resolveForge(instance.version, instance.loaderVersion);
    }
  } catch (err) {
    setState('error', err.message);
    return;
  }

  fs.mkdirSync(instanceDir(instance.id), { recursive: true });
  setState('downloading', 'Downloading & verifying game files…');

  try {
    const child = await launcher.launch(opts);
    if (!child) {
      setState('error', 'Could not start the game process. Check the logs.');
      return;
    }
    activeChild = child;
    setState('launching', 'Starting Minecraft…');

    let sawOutput = false;
    let childFailed = false;
    const markRunning = () => {
      if (!sawOutput) {
        sawOutput = true;
        setState('running', 'Minecraft is running');
        // launcher behavior once the game is up
        const win = deps.getWin();
        const action = settingsMod.get().behavior.launcherAction;
        if (win && !win.isDestroyed()) {
          if (action === 'minimize') win.minimize();
          else if (action === 'hide') win.hide();
        }
      }
    };
    child.stdout?.on('data', markRunning);
    child.stderr?.on('data', markRunning);
    const runningFallback = setTimeout(() => {
      if (activeChild === child) markRunning();
    }, 2500);
    child.on('error', (err) => {
      childFailed = true;
      clearTimeout(runningFallback);
      activeChild = null;
      setState('error', `Minecraft process failed: ${err.message}`);
    });
    child.on('close', (code) => {
      clearTimeout(runningFallback);
      activeChild = null;
      if (!childFailed) {
        setState('idle', code === 0 || code === null ? '' : `Game exited with code ${code}`);
      }
      const win = deps.getWin();
      const { launcherAction, reopenOnExit } = settingsMod.get().behavior;
      if (win && !win.isDestroyed() && launcherAction !== 'keep' && reopenOnExit) {
        win.show();
        if (win.isMinimized()) win.restore();
      }
    });
  } catch (err) {
    activeChild = null;
    setState('error', err.message);
  }
  } finally {
    launchInProgress = false;
  }
}

function init(dependencies, ipcMain) {
  deps = dependencies;

  // minecraft-launcher-core events -> renderer
  launcher.on('progress', (e) => {
    const percent = e.total ? Math.round((e.task / e.total) * 100) : 0;
    const label =
      e.type === 'assets'
        ? 'Verifying & downloading assets'
        : e.type === 'natives'
          ? 'Downloading natives'
          : `Downloading ${e.type}`;
    send('launcher:progress', { percent, detail: label });
  });

  launcher.on('debug', (line) => send('launcher:log', String(line)));
  launcher.on('data', (line) => send('launcher:log', String(line)));

  ipcMain.on('launcher:launch', (_event, payload) => {
    launch(payload).catch((err) => {
      activeChild = null;
      setState('error', err.message);
    });
  });

  ipcMain.on('launcher:kill', () => {
    if (activeChild) {
      activeChild.kill();
      activeChild = null;
      setState('idle', '');
    }
  });
}

module.exports = { init };
