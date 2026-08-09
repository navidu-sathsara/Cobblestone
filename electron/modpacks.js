const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { downloadFile, fetchJson, writeFileAtomic } = require('./download');

/**
 * Modpack installation (Modrinth .mrpack format).
 *
 * A .mrpack is a zip containing modrinth.index.json — a list of files
 * (mods, resource packs, …) with download URLs — plus an overrides/
 * folder of configs. Installing one creates a brand-new instance:
 *   1. fetch project + latest version, download the .mrpack
 *   2. parse the index: MC version + mod loader come from `dependencies`
 *   3. download every client-side file into the new instance dir
 *   4. copy overrides/ (and client-overrides/) on top
 */

let deps = null; // { app, getWin }

const rootDir = () => path.join(deps.app.getPath('userData'), 'minecraft');
const instanceDir = (id) => path.join(rootDir(), 'instances', id);

function progress(projectId, percent, detail) {
  const win = deps.getWin?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send('modpack:progress', { projectId, percent, detail });
  }
}

function loaderFromDependencies(dependencies) {
  if (dependencies['fabric-loader']) {
    return { loader: 'Fabric', loaderVersion: dependencies['fabric-loader'] };
  }
  if (dependencies.forge) {
    return { loader: 'Forge', loaderVersion: dependencies.forge };
  }
  if (dependencies.neoforge) {
    throw new Error('This pack requires NeoForge, which is not supported yet.');
  }
  if (dependencies['quilt-loader']) {
    throw new Error('This pack requires Quilt, which is not supported yet.');
  }
  return { loader: 'Vanilla', loaderVersion: null };
}

function resolveInside(base, relativePath) {
  const root = path.resolve(base);
  const target = path.resolve(root, String(relativePath ?? ''));
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe modpack path: ${relativePath}`);
  }
  return target;
}

async function install({ projectId, versionId = null, name = null }) {
  progress(projectId, 0, 'Fetching modpack info…');
  const project = await fetchJson(`https://api.modrinth.com/v2/project/${projectId}`);
  const versions = await fetchJson(`https://api.modrinth.com/v2/project/${projectId}/version`);
  if (!versions.length) throw new Error('This modpack has no versions.');
  const version = (versionId && versions.find((v) => v.id === versionId)) ?? versions[0];
  const file =
    version.files.find((f) => f.primary && f.filename.endsWith('.mrpack')) ??
    version.files.find((f) => f.filename.endsWith('.mrpack'));
  if (!file) throw new Error('No .mrpack file found in the latest version.');

  progress(projectId, 3, `Downloading ${project.title}…`);
  const packPath = path.join(rootDir(), '.downloads', `${crypto.randomUUID()}.mrpack`);
  await downloadFile(file.url, packPath, {
    retries: 3,
    expectedHashes: file.hashes,
    onProgress: ({ percent, retrying, attempt }) => {
      const pct = percent === null ? 3 : Math.max(1, Math.round(percent * 0.03));
      const detail = retrying ? `Retrying pack download (${attempt})…` : `Downloading ${project.title}…`;
      progress(projectId, pct, detail);
    }
  });

  let zip;
  try {
    zip = new AdmZip(packPath);
  } finally {
    fs.rmSync(packPath, { force: true });
  }

  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new Error('Invalid modpack: missing modrinth.index.json');
  const index = JSON.parse(indexEntry.getData().toString('utf8'));

  const mcVersion = index.dependencies?.minecraft;
  if (!mcVersion) throw new Error('Modpack does not declare a Minecraft version.');
  const { loader, loaderVersion } = loaderFromDependencies(index.dependencies);

  const id = crypto.randomUUID();
  const dir = instanceDir(id);
  fs.mkdirSync(dir, { recursive: true });

  try {
    // --- pack files (mods, resource packs, shaders, …) ---
    const files = (index.files ?? []).filter((f) => f.env?.client !== 'unsupported');
    const totalWeight = files.reduce((sum, f) => sum + (f.fileSize || 1), 0) || 1;
    let doneWeight = 0;
    let doneCount = 0;

    const CONCURRENCY = 8;
    const queue = [...files];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const f = queue.shift();
        const target = resolveInside(dir, f.path);
        await downloadFile(f.downloads, target, {
          retries: 3,
          expectedHashes: f.hashes
        });
        doneWeight += f.fileSize || 1;
        doneCount += 1;
        const pct = 5 + Math.round((doneWeight / totalWeight) * 85);
        progress(projectId, pct, `Downloading content — ${doneCount}/${files.length}`);
      }
    });
    await Promise.all(workers);

    // --- overrides (configs, options, …) ---
    progress(projectId, 92, 'Applying pack configs…');
    for (const prefix of ['overrides/', 'client-overrides/']) {
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory || !entry.entryName.startsWith(prefix)) continue;
        const rel = entry.entryName.slice(prefix.length);
        const target = resolveInside(dir, rel);
        writeFileAtomic(target, entry.getData());
      }
    }

    progress(projectId, 100, 'Done');
    return {
      id,
      name: name?.trim() || project.title,
      version: mcVersion,
      loader,
      loaderVersion,
      color: '#ff4133',
      icon: project.icon_url ?? null,
      created: Date.now(),
      lastPlayed: null,
      pack: {
        projectId: project.id,
        versionId: version.id,
        versionNumber: version.version_number
      }
    };
  } catch (err) {
    // don't leave a half-installed instance dir behind
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

function init(dependencies, ipcMain) {
  deps = dependencies;
  ipcMain.handle('modpack:install', (_event, payload) =>
    install(typeof payload === 'string' ? { projectId: payload } : payload)
  );
}

module.exports = { init, install, loaderFromDependencies };
