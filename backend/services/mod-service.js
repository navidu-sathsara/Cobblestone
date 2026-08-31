'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore } = require('../core/json-store');
const { safeFilename, resolveInside, assertNoSymlinkComponents } = require('../core/paths');
const { hashFile } = require('../core/files');
const { NotFoundError, ConflictError, ValidationError } = require('../core/errors');

const FOLDER_BY_TYPE = {
  mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks',
};

class ModService {
  constructor(paths, settings, instances, providers, downloads, events) {
    this.paths = paths;
    this.settings = settings;
    this.instances = instances;
    this.providers = providers;
    this.downloads = downloads;
    this.events = events;
    this.stores = new Map();
    this.backups = null;
  }

  setBackupService(backups) { this.backups = backups; }

  #store(instanceId) {
    if (!this.stores.has(instanceId)) {
      const file = resolveInside(this.paths.instance(instanceId), '.launcher-content.json');
      this.stores.set(instanceId, new JsonStore(file, { schemaVersion: 1, content: [] }, {
        validate: (value) => ({ schemaVersion: 1, content: Array.isArray(value?.content) ? value.content : [] }),
      }));
    }
    return this.stores.get(instanceId);
  }

  list(instanceId) {
    this.instances.get(instanceId);
    return this.#store(instanceId).readSync().content;
  }

  async install(instanceId, request, context = {}) {
    const instance = this.instances.get(instanceId);
    const provider = this.providers.get(request.provider || this.settings.get().mods.preferredProvider);
    const project = await provider.project(request.projectId);
    if (project.projectType === 'modpack') {
      throw new ValidationError('Use the modpack service to install modpacks');
    }
    const visited = context.visited || new Set();
    const visitKey = `${provider.id}:${request.projectId}`;
    if (visited.has(visitKey)) return this.list(instanceId).find((item) => item.key === visitKey) || null;
    visited.add(visitKey);

    return this.instances.withLock(instanceId, 'install-content', async () => {
      const channels = request.channels || this.settings.get().mods.releaseChannels;
      let version;
      if (request.versionId) {
        version = provider.id === 'curseforge'
          ? await provider.version(request.projectId, request.versionId)
          : await provider.version(request.versionId);
      } else {
        const versions = await provider.versions(request.projectId, {
          minecraftVersion: instance.minecraftVersion,
          // Resource packs, shaders and data packs are not loader-bound. A
          // Fabric/Forge facet here can hide otherwise compatible releases.
          loader: project.projectType === 'mod' ? instance.loader : undefined,
          channels,
        });
        version = versions[0];
      }
      if (!version) {
        throw new NotFoundError(`Compatible ${provider.id} version`, `${request.projectId}:${instance.minecraftVersion}:${instance.loader}`);
      }

      if (this.settings.get().mods.installRequiredDependencies && request.dependencies !== false) {
        for (const dependency of version.dependencies.filter((item) => item.type === 'required')) {
          if (!dependency.projectId) continue;
          await this.#installDependency(instanceId, provider, dependency, visited);
        }
      }

      const file = await provider.selectFile(version);
      const folder = request.folder || FOLDER_BY_TYPE[project.projectType] || 'mods';
      this.instances.assertContentFolder(folder);
      const filename = safeFilename(file.filename);
      const target = resolveInside(this.paths.instance(instanceId), folder, filename);
      const key = `${provider.id}:${project.projectId}`;
      const existing = this.list(instanceId).find((item) => item.key === key);
      if (existing?.versionId === version.versionId && fs.existsSync(target)) return existing;
      assertNoSymlinkComponents(this.paths.instance(instanceId), target);
      if (fs.existsSync(target) && (!existing || existing.filename !== filename)) {
        throw new ConflictError('A different or unmanaged file already uses this filename', { filename, folder });
      }

      this.events.emit('content:install', { instanceId, key, status: 'downloading', versionId: version.versionId });
      await this.downloads.download({
        url: file.url, destination: target, hashes: file.hashes, size: file.size, retries: 4,
      });
      const entry = {
        key, provider: provider.id, projectId: String(project.projectId), versionId: String(version.versionId),
        title: project.title, versionNumber: version.versionNumber, filename, folder,
        hashes: file.hashes || {}, size: file.size || fs.statSync(target).size,
        enabled: true, pinned: existing?.pinned || false,
        installedAt: existing?.installedAt || Date.now(), updatedAt: Date.now(),
        dependencies: version.dependencies || [],
      };
      await this.#store(instanceId).update((manifest) => {
        manifest.content = manifest.content.filter((item) => item.key !== key);
        manifest.content.push(entry);
      });
      if (existing && existing.filename !== filename) await this.#trashFile(instanceId, existing);
      this.events.emit('content:install', { instanceId, key, status: 'completed', entry });
      return entry;
    });
  }

  async #installDependency(instanceId, provider, dependency, visited) {
    const request = {
      provider: provider.id,
      projectId: dependency.projectId,
      versionId: dependency.versionId || undefined,
      dependencies: true,
    };
    // Dependency recursion must not reacquire the instance-level lock.
    const instance = this.instances.get(instanceId);
    const visitKey = `${provider.id}:${request.projectId}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);
    const versions = request.versionId
      ? [provider.id === 'curseforge'
        ? await provider.version(request.projectId, request.versionId)
        : await provider.version(request.versionId)]
      : await provider.versions(request.projectId, {
        minecraftVersion: instance.minecraftVersion, loader: instance.loader,
        channels: this.settings.get().mods.releaseChannels,
      });
    const version = versions[0];
    if (!version) throw new NotFoundError('Required dependency', request.projectId);
    for (const child of version.dependencies.filter((item) => item.type === 'required')) {
      if (child.projectId) await this.#installDependency(instanceId, provider, child, visited);
    }
    const project = await provider.project(request.projectId);
    const file = await provider.selectFile(version);
    const folder = FOLDER_BY_TYPE[project.projectType] || 'mods';
    const filename = safeFilename(file.filename);
    const target = resolveInside(this.paths.instance(instanceId), folder, filename);
    assertNoSymlinkComponents(this.paths.instance(instanceId), target);
    const installed = this.list(instanceId);
    const previous = installed.find((item) => item.key === visitKey);
    const conflict = installed.find((item) => item.filename === filename && item.folder === folder && item.key !== visitKey);
    if (fs.existsSync(target) && (!previous || previous.filename !== filename)) {
      throw new ConflictError('A different or unmanaged file already uses this dependency filename', {
        filename, conflict: conflict?.key || null,
      });
    }
    await this.downloads.download({ url: file.url, destination: target, hashes: file.hashes, size: file.size });
    const entry = {
      key: visitKey, provider: provider.id, projectId: String(project.projectId), versionId: String(version.versionId),
      title: project.title, versionNumber: version.versionNumber, filename, folder,
      hashes: file.hashes || {}, size: file.size || fs.statSync(target).size,
      enabled: true, pinned: false, installedAt: Date.now(), updatedAt: Date.now(),
      dependencies: version.dependencies || [],
    };
    await this.#store(instanceId).update((manifest) => {
      const previousEntry = manifest.content.find((item) => item.key === visitKey);
      manifest.content = manifest.content.filter((item) => item.key !== visitKey);
      manifest.content.push({
        ...entry,
        installedAt: previousEntry?.installedAt || entry.installedAt,
        pinned: previousEntry?.pinned || false,
      });
    });
  }

  async checkUpdates(instanceId) {
    const instance = this.instances.get(instanceId);
    const channels = this.settings.get().mods.releaseChannels;
    const results = [];
    for (const entry of this.list(instanceId)) {
      if (entry.provider === 'local') {
        results.push({ entry, available: false, reason: 'local-file' });
        continue;
      }
      if (entry.pinned && !this.settings.get().mods.updatePinned) {
        results.push({ entry, available: false, reason: 'pinned' });
        continue;
      }
      try {
        const versions = await this.providers.get(entry.provider).versions(entry.projectId, {
          minecraftVersion: instance.minecraftVersion,
          loader: entry.folder === 'mods' ? instance.loader : undefined,
          channels,
        });
        const latest = versions[0];
        results.push({ entry, available: Boolean(latest && latest.versionId !== entry.versionId), latest: latest || null });
      } catch (error) {
        results.push({ entry, available: false, error: error.message });
      }
    }
    return results;
  }

  async importLocal(instanceId, sourcePath, { folder = 'mods', title = null } = {}) {
    return this.instances.withLock(instanceId, 'import-content', () => (
      this.#importLocal(instanceId, sourcePath, { folder, title })
    ));
  }

  async #importLocal(instanceId, sourcePath, { folder = 'mods', title = null } = {}) {
    this.instances.get(instanceId);
    this.instances.assertContentFolder(folder);
    const source = path.resolve(String(sourcePath));
    const stat = await fsp.stat(source);
    if (!stat.isFile()) throw new ValidationError('Local content source must be a file');
    const filename = safeFilename(path.basename(source));
    const allowed = {
      mods: ['.jar', '.zip'], resourcepacks: ['.zip'], shaderpacks: ['.zip'], datapacks: ['.zip'],
    }[folder];
    if (!allowed.includes(path.extname(filename).toLowerCase())) {
      throw new ValidationError('Local file type is not valid for this content folder', { folder, filename });
    }
    const hashes = await hashFile(source, ['sha256']);
    const key = `local:${hashes.sha256}`;
    const destination = resolveInside(this.paths.instance(instanceId), folder, filename);
    assertNoSymlinkComponents(this.paths.instance(instanceId), destination);
    if (fs.existsSync(destination)) throw new ConflictError('A file with this name already exists', { folder, filename });
    const temporary = `${destination}.${crypto.randomUUID()}.part`;
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fsp.copyFile(source, temporary);
      await fsp.rename(temporary, destination);
    } finally { await fsp.rm(temporary, { force: true }); }
    const entry = {
      key, provider: 'local', projectId: hashes.sha256, versionId: hashes.sha256,
      title: String(title || filename), versionNumber: null, filename, folder,
      hashes, size: stat.size, enabled: true, pinned: true,
      installedAt: Date.now(), updatedAt: Date.now(), dependencies: [],
    };
    await this.#store(instanceId).update((manifest) => { manifest.content.push(entry); });
    this.events.emit('content:install', { instanceId, key, status: 'completed', entry });
    return entry;
  }

  async updateAll(instanceId) {
    const updates = (await this.checkUpdates(instanceId)).filter((item) => item.available);
    if (updates.length && this.settings.get().instances.autoBackupBeforeUpdates && this.backups) {
      await this.backups.create(instanceId, { kind: 'content', reason: 'before-mod-update' });
    }
    const results = [];
    for (const update of updates) {
      try {
        const entry = await this.install(instanceId, {
          provider: update.entry.provider,
          projectId: update.entry.projectId,
          versionId: update.latest.versionId,
        });
        results.push({ ok: true, entry });
      } catch (error) { results.push({ ok: false, entry: update.entry, error: error.message }); }
    }
    return results;
  }

  async remove(instanceId, key) {
    const entry = this.list(instanceId).find((item) => item.key === key);
    if (!entry) throw new NotFoundError('Installed content', key);
    await this.#trashFile(instanceId, entry);
    await this.#store(instanceId).update((manifest) => {
      manifest.content = manifest.content.filter((item) => item.key !== key);
    });
    this.events.emit('content:removed', { instanceId, key });
    return true;
  }

  async setEnabled(instanceId, key, enabled) {
    const entry = this.list(instanceId).find((item) => item.key === key);
    if (!entry) throw new NotFoundError('Installed content', key);
    if (entry.enabled === enabled) return entry;
    const current = resolveInside(this.paths.instance(instanceId), entry.folder, entry.filename);
    const nextName = enabled ? entry.filename.replace(/\.disabled$/, '') : `${entry.filename}.disabled`;
    const next = resolveInside(this.paths.instance(instanceId), entry.folder, nextName);
    if (fs.existsSync(next)) throw new ConflictError('Cannot toggle content because destination already exists', { next });
    await fsp.rename(current, next);
    let updated;
    await this.#store(instanceId).update((manifest) => {
      updated = manifest.content.find((item) => item.key === key);
      updated.enabled = enabled;
      updated.filename = nextName;
      updated.updatedAt = Date.now();
    });
    return updated;
  }

  async setPinned(instanceId, key, pinned) {
    let updated;
    await this.#store(instanceId).update((manifest) => {
      updated = manifest.content.find((item) => item.key === key);
      if (!updated) throw new NotFoundError('Installed content', key);
      updated.pinned = Boolean(pinned);
    });
    return updated;
  }

  async verify(instanceId) {
    const results = [];
    for (const entry of this.list(instanceId)) {
      const file = resolveInside(this.paths.instance(instanceId), entry.folder, entry.filename);
      if (!fs.existsSync(file)) {
        results.push({ key: entry.key, valid: false, reason: 'missing' });
        continue;
      }
      const algorithms = Object.keys(entry.hashes || {}).filter((name) => crypto.getHashes().includes(name));
      if (!algorithms.length) {
        results.push({ key: entry.key, valid: true, reason: 'unverified' });
        continue;
      }
      const actual = await hashFile(file, algorithms);
      const valid = algorithms.every((algorithm) => actual[algorithm].toLowerCase() === entry.hashes[algorithm].toLowerCase());
      results.push({ key: entry.key, valid, reason: valid ? null : 'hash-mismatch', actual });
    }
    return results;
  }

  scanUnmanaged(instanceId) {
    const tracked = new Set(this.list(instanceId).map((entry) => `${entry.folder}/${entry.filename}`));
    const files = [];
    for (const folder of Object.values(FOLDER_BY_TYPE)) {
      const directory = resolveInside(this.paths.instance(instanceId), folder);
      try {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          if (entry.isFile() && !tracked.has(`${folder}/${entry.name}`)) {
            files.push({ folder, filename: entry.name, size: fs.statSync(resolveInside(directory, entry.name)).size });
          }
        }
      } catch { /* absent folder */ }
    }
    return files;
  }

  async #trashFile(instanceId, entry) {
    const source = resolveInside(this.paths.instance(instanceId), entry.folder, entry.filename);
    if (!fs.existsSync(source)) return;
    const directory = resolveInside(this.paths.instance(instanceId), '.trash', 'content');
    await fsp.mkdir(directory, { recursive: true });
    await fsp.rename(source, resolveInside(directory, `${Date.now()}-${safeFilename(entry.filename)}`));
  }
}

module.exports = { ModService, FOLDER_BY_TYPE };
