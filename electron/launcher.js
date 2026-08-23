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

const PHASE_LABELS = {
  assets: 'Verifying assets',
  'assets-copy': 'Copying assets',
  natives: 'Downloading natives',
  classes: 'Downloading libraries',
  'classes-custom': 'Downloading loader libraries',
  'classes-maven-custom': 'Downloading loader libraries',
  'version-jar': 'Downloading game jar'
};

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
      onProgress: ({ percent, received, total, retrying, attempt }) => {
        const detail = `Downloading Forge ${forgeVersion}${retrying ? ` — retry ${attempt}` : ''}`;
        setState('downloading', detail);
        if (percent !== null) {
          send('launcher:progress', { percent, detail, phase: 'downloading', bytes: received, size: total });
        }
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

  // Per-instance overrides fall back to the global settings when disabled.
  const ov = instance.overrides || {};
  const memory = ov.memory?.enabled ? ov.memory : settings.memory;
  const resolution = ov.resolution?.enabled ? ov.resolution : settings.resolution;
  const jvmArgs = typeof ov.jvmArgs === 'string' && ov.jvmArgs.trim()
    ? ov.jvmArgs.trim().split(/\s+/)
    : null;

  // resolve the right Java for this MC version (auto-download if needed),
  // unless the instance pins its own Java binary.
  let javaPath;
  const overrideJava = ov.java?.enabled && ov.java.path ? ov.java.path : null;
  if (overrideJava) {
    javaPath = overrideJava;
  } else {
    try {
      javaPath = await javaMod.ensureJava(instance.version, {
        setState,
        sendProgress: (p) => send('launcher:progress', p)
      });
    } catch (err) {
      setState('error', `Java setup failed: ${err.message}`);
      return;
    }
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
    memory: { min: `${memory.min}G`, max: `${memory.max}G` },
    window: {
      width: resolution.width,
      height: resolution.height,
      fullscreen: resolution.fullscreen
    },
    overrides: { gameDirectory: instanceDir(instance.id) },
    authorization: authorization ?? Authenticator.getAuth(account?.username || 'Player'),
    javaPath
  };
  if (jvmArgs) opts.customArgs = jvmArgs;

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

  // mclc reports file counts per phase; 'download-status' reports bytes for the
  // file currently in flight. Neither alone is a size, so bytes are accumulated
  // here: completed files are banked as each download finishes, and the in
  // flight file is added on top. Reset per phase so a count doesn't carry over.
  let phase = null;
  let bankedBytes = 0;
  let activeBytes = 0;
  const inFlight = new Map();

  const resetBytes = () => {
    bankedBytes = 0;
    activeBytes = 0;
    inFlight.clear();
  };

  launcher.on('download-status', ({ name, type, current, total }) => {
    if (type !== phase) return;
    inFlight.set(name, current);
    activeBytes = 0;
    for (const value of inFlight.values()) activeBytes += value;
    // A finished file is banked so its bytes survive the map being cleared.
    if (total && current >= total) {
      bankedBytes += current;
      inFlight.delete(name);
      activeBytes -= current;
    }
  });

  let lastProgressSentAt = 0;
  let lastPercentSent = -1;
  let lastPhaseSent = null;

  launcher.on('progress', (e) => {
    if (e.type !== phase) {
      phase = e.type;
      resetBytes();
    }
    const percent = e.total ? Math.round((e.task / e.total) * 100) : 0;
    const now = Date.now();

    if (e.type !== lastPhaseSent || percent !== lastPercentSent || now - lastProgressSentAt >= 100) {
      lastProgressSentAt = now;
      lastPercentSent = percent;
      lastPhaseSent = e.type;

      send('launcher:progress', {
        percent,
        detail: PHASE_LABELS[e.type] ?? `Downloading ${e.type}`,
        // 'assets' is mostly a SHA1 sweep of files already on disk, so it is
        // reported as verifying rather than downloading.
        phase: e.type === 'assets' ? 'verifying' : 'downloading',
        task: e.task,
        total: e.total,
        bytes: bankedBytes + activeBytes
      });
    }
  });

  let logBatch = [];
  let logTimeout = null;

  const flushLogs = () => {
    if (logBatch.length > 0) {
      send('launcher:log', logBatch);
      logBatch = [];
    }
    logTimeout = null;
  };

  const queueLog = (line) => {
    logBatch.push(String(line));
    if (!logTimeout) {
      logTimeout = setTimeout(flushLogs, 100);
    }
  };

  launcher.on('debug', queueLog);
  launcher.on('data', queueLog);

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
