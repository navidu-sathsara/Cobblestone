'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { resolveInside, safeFilename, assertNoSymlinkComponents } = require('../core/paths');
const { ValidationError, NotFoundError } = require('../core/errors');

const INCLUDE = {
  worlds: ['saves'],
  content: ['mods', 'config', 'resourcepacks', 'shaderpacks', '.launcher-content.json'],
  full: ['saves', 'mods', 'config', 'resourcepacks', 'shaderpacks', 'screenshots', 'options.txt', 'servers.dat', '.launcher-content.json'],
};

class BackupService {
  constructor(paths, settings, instances, events) {
    this.paths = paths;
    this.settings = settings;
    this.instances = instances;
    this.events = events;
  }

  async create(instanceId, { kind = 'full', reason = 'manual' } = {}) {
    const instance = this.instances.get(instanceId);
    if (!INCLUDE[kind]) throw new ValidationError('Unsupported backup kind', { kind });
    return this.instances.withLock(instanceId, 'backup', async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${instanceId}-${timestamp}-${kind}.zip`;
      const destination = resolveInside(this.paths.backups, filename);
      const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
      const zip = new AdmZip();
      zip.addFile('backup.json', Buffer.from(JSON.stringify({
        schemaVersion: 1, instance, kind, reason, createdAt: Date.now(),
      }, null, 2)));
      for (const relative of INCLUDE[kind]) this.#add(zip, this.paths.instance(instanceId), relative);
      await new Promise((resolve, reject) => zip.writeZip(temporary, (error) => error ? reject(error) : resolve()));
      await fsp.rename(temporary, destination);
      await this.prune(instanceId);
      const result = { filename, path: destination, bytes: fs.statSync(destination).size, kind, reason };
      this.events.emit('backup:created', { instanceId, ...result });
      return result;
    });
  }

  #add(zip, root, relative) {
    const source = resolveInside(root, relative);
    if (!fs.existsSync(source)) return;
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) return;
    if (stat.isFile()) {
      zip.addLocalFile(source, path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative));
      return;
    }
    for (const entry of fs.readdirSync(source)) this.#add(zip, root, path.join(relative, entry));
  }

  list(instanceId = null) {
    const prefix = instanceId ? `${instanceId}-` : '';
    try {
      return fs.readdirSync(this.paths.backups, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.zip'))
        .map((entry) => {
          const stat = fs.statSync(resolveInside(this.paths.backups, entry.name));
          return { filename: entry.name, bytes: stat.size, createdAt: stat.mtimeMs };
        }).sort((a, b) => b.createdAt - a.createdAt);
    } catch { return []; }
  }

  async restore(filename, { targetInstanceId = null } = {}) {
    const archive = resolveInside(this.paths.backups, safeFilename(filename));
    if (!fs.existsSync(archive)) throw new NotFoundError('Backup', filename);
    const zip = new AdmZip(archive);
    const metadataEntry = zip.getEntry('backup.json');
    if (!metadataEntry) throw new ValidationError('Invalid backup archive');
    const metadata = JSON.parse(metadataEntry.getData().toString('utf8'));
    const id = targetInstanceId || metadata.instance?.id;
    this.instances.get(id);
    return this.instances.withLock(id, 'restore-backup', async () => {
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory || entry.entryName === 'backup.json') continue;
        const target = resolveInside(this.paths.instance(id), entry.entryName);
        assertNoSymlinkComponents(this.paths.instance(id), target);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.writeFile(target, entry.getData());
      }
      this.events.emit('backup:restored', { instanceId: id, filename });
      return this.instances.get(id);
    });
  }

  async prune(instanceId) {
    const keep = this.settings.get().instances.backupRetention;
    for (const backup of this.list(instanceId).slice(keep)) {
      await fsp.rm(resolveInside(this.paths.backups, backup.filename), { force: true });
    }
  }
}

module.exports = { BackupService, INCLUDE };
