const path = require('path');
const fs = require('fs');
const { downloadFile, writeFileAtomic } = require('./download');

/**
 * Mod installation (main process).
 * Mod jars land in the instance's own mods/ folder; a small manifest
 * (.native-mods.json) tracks projectId -> filename so the UI can show
 * installed state and cleanly remove mods later.
 */

let deps = null; // { app }

const rootDir = () => path.join(deps.app.getPath('userData'), 'minecraft');
const instancesDir = () => path.join(rootDir(), 'instances');
const ALLOWED_FOLDERS = new Set(['mods', 'resourcepacks', 'shaderpacks', 'datapacks']);

function resolveInside(base, ...parts) {
  const root = path.resolve(base);
  const target = path.resolve(root, ...parts.map((part) => String(part ?? '')));
  const relative = path.relative(root, target);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('Invalid path outside the instance directory');
  }
  return target;
}

const instanceDir = (instanceId) => resolveInside(instancesDir(), instanceId);
const modsDir = (instanceId) => resolveInside(instanceDir(instanceId), 'mods');
const manifestPath = (instanceId) => path.join(modsDir(instanceId), '.native-mods.json');

function validateDestination(instanceId, folder, filename) {
  if (!ALLOWED_FOLDERS.has(folder)) throw new Error('Unsupported content folder');
  if (!filename || path.basename(filename) !== filename) throw new Error('Invalid filename');
  const dir = resolveInside(instanceDir(instanceId), folder);
  return { dir, target: resolveInside(dir, filename) };
}

function readManifest(instanceId) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(instanceId), 'utf8'));
  } catch {
    return {};
  }
}

function writeManifest(instanceId, manifest) {
  fs.mkdirSync(modsDir(instanceId), { recursive: true });
  writeFileAtomic(manifestPath(instanceId), JSON.stringify(manifest, null, 2));
}

function cleanMetadata(metadata) {
  const text = (value, max) => String(value ?? '').trim().slice(0, max);
  const source = metadata?.source === 'cf' ? 'cf' : 'modrinth';
  return {
    title: text(metadata?.title, 160),
    description: text(metadata?.description, 600),
    iconUrl: text(metadata?.iconUrl, 2048),
    author: text(metadata?.author, 120),
    source,
    version: text(metadata?.version, 120)
  };
}

function init(dependencies, ipcMain) {
  deps = dependencies;

  ipcMain.handle('mods:installed', (_event, instanceId) => readManifest(instanceId));

  // folder: mods | resourcepacks | shaderpacks | datapacks
  ipcMain.handle(
    'mods:install',
    async (_event, { instanceId, projectId, url, filename, folder = 'mods', metadata }) => {
      const parsedUrl = new URL(url);
      if (!['https:', 'http:'].includes(parsedUrl.protocol)) throw new Error('Unsupported download URL');
      const { dir, target } = validateDestination(instanceId, folder, filename);
      fs.mkdirSync(dir, { recursive: true });
      await downloadFile(url, target, { retries: 3 });

      const manifest = readManifest(instanceId);
      manifest[projectId] = { filename, folder, metadata: cleanMetadata(metadata) };
      writeManifest(instanceId, manifest);
      return manifest;
    }
  );

  ipcMain.handle('mods:remove', (_event, { instanceId, projectId }) => {
    const manifest = readManifest(instanceId);
    const entry = manifest[projectId];
    if (entry) {
      // older manifests stored a bare filename string in the mods folder
      const filename = typeof entry === 'string' ? entry : entry.filename;
      const folder = typeof entry === 'string' ? 'mods' : entry.folder;
      try {
        const { target } = validateDestination(instanceId, folder, filename);
        fs.unlinkSync(target);
      } catch {
        // file already gone — still drop it from the manifest
      }
      delete manifest[projectId];
      writeManifest(instanceId, manifest);
    }
    return manifest;
  });
}

module.exports = { init, resolveInside, validateDestination, cleanMetadata };
