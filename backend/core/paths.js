'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { ValidationError } = require('./errors');

function resolveInside(base, ...parts) {
  const root = path.resolve(base);
  const target = path.resolve(root, ...parts.map((part) => String(part ?? '')));
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new ValidationError('Path escapes its allowed directory', { base: root, target });
  }
  return target;
}

function safeFilename(value) {
  const name = String(value ?? '').trim();
  if (!name || name !== path.basename(name) || /[\0<>:"|?*]/.test(name)) {
    throw new ValidationError('Invalid filename', { value });
  }
  return name;
}

function assertNoSymlinkComponents(base, target) {
  const root = path.resolve(base);
  const destination = resolveInside(root, path.relative(root, path.resolve(target)));
  const segments = path.relative(root, destination).split(path.sep).filter(Boolean);
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw new ValidationError('Symbolic links are not allowed in managed write paths', { path: current });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return destination;
}

class LauncherPaths {
  constructor(dataDir = process.env.COBBLESTONE_DATA_DIR || path.join(os.homedir(), '.cobblestone')) {
    this.data = path.resolve(dataDir);
    this.game = path.join(this.data, 'minecraft');
    this.instances = path.join(this.game, 'instances');
    this.versions = path.join(this.game, 'versions');
    this.libraries = path.join(this.game, 'libraries');
    this.assets = path.join(this.game, 'assets');
    this.java = path.join(this.data, 'java');
    this.cache = path.join(this.data, 'cache');
    this.metadata = path.join(this.data, 'metadata');
    this.downloads = path.join(this.data, 'downloads');
    this.backups = path.join(this.data, 'backups');
    this.trash = path.join(this.data, 'trash');
    this.logs = path.join(this.data, 'logs');
    this.state = path.join(this.data, 'state');
  }

  ensure() {
    for (const directory of Object.values(this)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    return this;
  }

  instance(id) { return resolveInside(this.instances, id); }
  backup(name) { return resolveInside(this.backups, safeFilename(name)); }
}

module.exports = { LauncherPaths, resolveInside, safeFilename, assertNoSymlinkComponents };
