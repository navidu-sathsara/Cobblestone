const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { shell } = require('electron');

/**
 * Instance filesystem helpers (main process).
 *
 * Instance game directory lives at:
 *   {userData}/minecraft/instances/{instanceId}/
 */

let deps = null;

const rootDir = () => path.join(deps.app.getPath('userData'), 'minecraft');
const instancesDir = () => path.join(rootDir(), 'instances');

function resolveInside(base, ...parts) {
  const root = path.resolve(base);
  const target = path.resolve(root, ...parts.map((part) => String(part ?? '')));
  const relative = path.relative(root, target);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('Invalid path outside the instance directory');
  }
  return target;
}

const instanceDir = (id) => resolveInside(instancesDir(), id);

/* ── helpers ────────────────────────────────────────────────── */

function getDirSize(dirPath) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) total += getDirSize(full);
      else { try { total += fs.statSync(full).size; } catch { /* locked */ } }
    }
  } catch { /* unreadable */ }
  return total;
}

/* ── listDir ────────────────────────────────────────────────── */

function listDir(instanceId, subpath) {
  const base = resolveInside(instanceDir(instanceId), subpath);
  try {
    return fs.readdirSync(base, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => {
        const full = path.join(base, e.name);
        let size = 0, modified = 0;
        try { const s = fs.statSync(full); size = s.size; modified = s.mtimeMs; } catch {}
        return { name: e.name, isDir: e.isDirectory(), size, modified };
      })
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return [];
  }
}

/* ── worldList ──────────────────────────────────────────────── */

function worldList(instanceId) {
  const savesDir = path.join(instanceDir(instanceId), 'saves');
  try {
    return fs.readdirSync(savesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => {
        const worldPath = path.join(savesDir, e.name);
        let modified = 0, sizeBytes = 0;
        try { modified = fs.statSync(worldPath).mtimeMs; } catch {}
        sizeBytes = getDirSize(worldPath);
        return { name: e.name, modified, sizeBytes };
      })
      .sort((a, b) => b.modified - a.modified);
  } catch {
    return [];
  }
}

/* ── getLogFile ─────────────────────────────────────────────── */

function getLogFile(instanceId) {
  const logPath = path.join(instanceDir(instanceId), 'logs', 'latest.log');
  try {
    const raw = fs.readFileSync(logPath, 'utf8');
    const lines = raw.split('\n');
    return lines.slice(-800).join('\n');
  } catch {
    return null;
  }
}

/* ── recent multiplayer servers ─────────────────────────────── */

function cleanServerAddress(raw) {
  let value = String(raw || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim()
    .replace(/^\//, '')
    .replace(/[.)]+$/, '');

  const commaAddress = value.match(/^(.+?),\s*(\d{1,5})$/);
  if (commaAddress) value = `${commaAddress[1].trim()}:${commaAddress[2]}`;
  if (!value || value.length > 255 || /\s/.test(value)) return null;
  return value;
}

function logDate(fileName, modified, hours, minutes, seconds) {
  const datedName = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
  const base = datedName
    ? new Date(
      Number(datedName[1]),
      Number(datedName[2]) - 1,
      Number(datedName[3]),
      hours,
      minutes,
      seconds
    )
    : new Date(modified);

  if (!datedName) {
    base.setHours(hours, minutes, seconds, 0);
    // latest.log may cross midnight before being rotated.
    if (base.getTime() > modified + 60 * 60 * 1000) base.setDate(base.getDate() - 1);
  }
  return base.getTime();
}

function parseServerConnections(text, { fileName = 'latest.log', modified = Date.now() } = {}) {
  const connections = [];
  const linePattern = /\[(\d{2}):(\d{2}):(\d{2})\].*?\bConnecting to\s+(.+?)\s*$/i;

  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(linePattern);
    if (!match) continue;
    const address = cleanServerAddress(match[4]);
    if (!address) continue;
    connections.push({
      address,
      connectedAt: logDate(
        fileName,
        modified,
        Number(match[1]),
        Number(match[2]),
        Number(match[3])
      )
    });
  }
  return connections;
}

function readInstanceNames() {
  try {
    const data = JSON.parse(fs.readFileSync(
      path.join(deps.app.getPath('userData'), 'instances.json'),
      'utf8'
    ));
    return new Map((data?.instances || []).map((instance) => [
      String(instance.id),
      String(instance.name || instance.id)
    ]));
  } catch {
    return new Map();
  }
}

function readLogText(filePath) {
  const buffer = fs.readFileSync(filePath);
  return filePath.endsWith('.gz') ? zlib.gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');
}

function recentServers() {
  const names = readInstanceNames();
  let directories = [];
  try {
    directories = fs.readdirSync(instancesDir(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory());
  } catch {
    return [];
  }

  const found = [];
  for (const directory of directories) {
    const logsDir = resolveInside(instanceDir(directory.name), 'logs');
    let logFiles = [];
    try {
      logFiles = fs.readdirSync(logsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /(?:\.log|\.log\.gz)$/i.test(entry.name))
        .map((entry) => {
          const filePath = resolveInside(logsDir, entry.name);
          return { filePath, fileName: entry.name, stat: fs.statSync(filePath) };
        })
        .filter((file) => file.stat.size <= 16 * 1024 * 1024)
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
        .slice(0, 20);
    } catch {
      continue;
    }

    for (const file of logFiles) {
      try {
        const connections = parseServerConnections(readLogText(file.filePath), {
          fileName: file.fileName,
          modified: file.stat.mtimeMs
        });
        for (const connection of connections) {
          found.push({
            ...connection,
            instanceId: directory.name,
            instanceName: names.get(directory.name) || directory.name
          });
        }
      } catch {
        // A partially written or corrupt compressed log should not hide other history.
      }
    }
  }

  const servers = new Map();
  for (const connection of found.sort((a, b) => b.connectedAt - a.connectedAt)) {
    const key = connection.address.toLowerCase();
    const existing = servers.get(key);
    if (!existing) {
      servers.set(key, { ...connection, visits: 1 });
    } else {
      existing.visits += 1;
    }
  }
  return [...servers.values()].slice(0, 8);
}

/* ── init ───────────────────────────────────────────────────── */

function init(dependencies, ipcMain) {
  deps = dependencies;

  ipcMain.handle('instance:listDir', (_e, instanceId, subpath) =>
    listDir(instanceId, subpath || '')
  );

  ipcMain.handle('instance:openFolder', (_e, instanceId, subpath) => {
    const target = resolveInside(instanceDir(instanceId), subpath || '');
    fs.mkdirSync(target, { recursive: true });
    return shell.openPath(target);
  });

  ipcMain.handle('instance:worldList', (_e, instanceId) => worldList(instanceId));

  ipcMain.handle('instance:deleteWorld', (_e, instanceId, worldName) => {
    const savesDir = resolveInside(instanceDir(instanceId), 'saves');
    const worldPath = resolveInside(savesDir, worldName);
    if (worldPath === savesDir) throw new Error('A world name is required');
    fs.rmSync(worldPath, { recursive: true, force: true });
  });

  ipcMain.handle('instance:getLogFile', (_e, instanceId) => getLogFile(instanceId));

  ipcMain.handle('instance:recentServers', () => recentServers());

  ipcMain.handle('instance:isInstalled', (_e, version) => {
    const versionsDir = path.join(rootDir(), 'versions');
    const versionDir = resolveInside(versionsDir, version);
    const jar = resolveInside(versionDir, `${version}.jar`);
    return fs.existsSync(jar);
  });
}

module.exports = { init, resolveInside, cleanServerAddress, parseServerConnections };
