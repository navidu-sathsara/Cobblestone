const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const DEFAULTS = {
  appearance: { theme: 'redstone' },
  memory: { min: 1, max: 4 }, // GB
  java: {
    // one configured path per Java major "slot" — resolved per MC version at launch
    paths: { 8: '', 17: '', 21: '' }
  },
  resolution: { width: 854, height: 480, fullscreen: false },
  behavior: {
    launcherAction: 'keep', // keep | minimize | hide
    reopenOnExit: true,
    confirmInstanceDelete: true
  },
  apiKeys: {
    curseforge: ''
  }
};

let deps = null;
let cache = null;

const filePath = () => path.join(deps.app.getPath('userData'), 'settings.json');

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override ?? {})) {
    if (
      override[key] &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object'
    ) {
      out[key] = deepMerge(base[key], override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
}

function load() {
  if (!cache) {
    let saved = {};
    try {
      saved = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    } catch {
      // first run — defaults
    }
    cache = deepMerge(DEFAULTS, saved);
  }
  return cache;
}

function save(next) {
  cache = deepMerge(DEFAULTS, next);
  fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2));
  return cache;
}

/** Probe one java binary for its version string. */
function probeJava(javaPath) {
  return new Promise((resolve) => {
    let output = '';
    const proc = spawn(javaPath, ['-version']);
    proc.stderr.on('data', (d) => (output += d));
    proc.stdout.on('data', (d) => (output += d));
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) return resolve(null);
      const match = output.match(/version "([^"]+)"/);
      resolve({ path: javaPath, version: match ? match[1] : 'unknown' });
    });
  });
}

/** Scan PATH + well-known install directories for Java runtimes. */
async function detectJava() {
  const candidates = new Set(['java']);
  const globDirs = [];

  if (process.platform === 'win32') {
    for (const base of [
      'C:\\Program Files\\Java',
      'C:\\Program Files (x86)\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft'
    ]) {
      globDirs.push({ base, suffix: 'bin\\java.exe' });
    }
  } else if (process.platform === 'darwin') {
    globDirs.push({
      base: '/Library/Java/JavaVirtualMachines',
      suffix: 'Contents/Home/bin/java'
    });
  } else {
    globDirs.push({ base: '/usr/lib/jvm', suffix: 'bin/java' });
  }
  globDirs.push({ base: path.join(os.homedir(), '.jdks'), suffix: 'bin/java' });

  for (const { base, suffix } of globDirs) {
    try {
      for (const entry of fs.readdirSync(base)) {
        const candidate = path.join(base, entry, suffix);
        if (fs.existsSync(candidate)) candidates.add(candidate);
      }
    } catch {
      // directory doesn't exist — skip
    }
  }

  const results = await Promise.all([...candidates].map(probeJava));
  const found = results.filter(Boolean);
  // label the PATH entry
  return found.map((j) => (j.path === 'java' ? { ...j, label: 'System PATH' } : j));
}

/** Recursively sum a directory's size in bytes. Returns 0 for missing dirs. */
function getDirSize(dirPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirSize(full);
      } else if (entry.isFile()) {
        try { total += fs.statSync(full).size; } catch { /* locked / gone */ }
      }
    }
  } catch { /* unreadable — skip */ }
  return total;
}

/** Return per-category disk usage under userData. */
function getStorageInfo(userDataPath) {
  const categories = [
    { key: 'instances', label: 'Instances',     dir: path.join('minecraft', 'instances') },
    { key: 'runtimes',  label: 'Java Runtimes', dir: 'java' },
    { key: 'assets',    label: 'Game Assets',   dir: path.join('minecraft', 'assets') },
    { key: 'libraries', label: 'Libraries',     dir: path.join('minecraft', 'libraries') },
    { key: 'versions',  label: 'Version Jars',  dir: path.join('minecraft', 'versions') },
  ];
  return categories.map(({ key, label, dir }) => ({
    key,
    label,
    bytes: getDirSize(path.join(userDataPath, dir)),
  }));
}

function init(dependencies, ipcMain) {
  deps = dependencies;

  ipcMain.handle('settings:load', () => load());
  ipcMain.handle('settings:save', (_e, next) => save(next));
  ipcMain.handle('settings:detectJava', () => detectJava());
  ipcMain.handle('settings:dataDir', () => deps.app.getPath('userData'));
  ipcMain.handle('settings:openDataDir', () => {
    const { shell } = require('electron');
    return shell.openPath(deps.app.getPath('userData'));
  });
  ipcMain.handle('settings:storageInfo', () =>
    getStorageInfo(deps.app.getPath('userData'))
  );
}

module.exports = { init, get: load, set: save, probeJava, detectJava };
