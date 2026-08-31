'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { resolveInside, assertNoSymlinkComponents } = require('../core/paths');
const { writeFileAtomicSync } = require('../core/files');
const { ValidationError, IntegrityError, NotFoundError } = require('../core/errors');

const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 8 * 1024 * 1024 * 1024;

function loaderFromDependencies(dependencies = {}) {
  if (dependencies['fabric-loader']) return { loader: 'fabric', loaderVersion: dependencies['fabric-loader'] };
  if (dependencies['quilt-loader']) return { loader: 'quilt', loaderVersion: dependencies['quilt-loader'] };
  if (dependencies.neoforge) return { loader: 'neoforge', loaderVersion: dependencies.neoforge };
  if (dependencies.forge) return { loader: 'forge', loaderVersion: dependencies.forge };
  return { loader: 'vanilla', loaderVersion: null };
}

class ModpackService {
  constructor(paths, instances, providers, downloads, events) {
    this.paths = paths;
    this.instances = instances;
    this.providers = providers;
    this.downloads = downloads;
    this.events = events;
  }

  async installFromProvider({ provider: providerId = 'modrinth', projectId, versionId, name }) {
    const provider = this.providers.get(providerId);
    const project = await provider.project(projectId);
    const versions = versionId
      ? [providerId === 'curseforge' ? await provider.version(projectId, versionId) : await provider.version(versionId)]
      : await provider.versions(projectId, {});
    const version = versions[0];
    if (!version) throw new NotFoundError('Modpack version', versionId || projectId);
    const file = await provider.selectFile(version);
    const archive = path.join(this.paths.downloads, `pack-${crypto.randomUUID()}-${path.basename(file.filename)}`);
    await this.downloads.download({ url: file.url, destination: archive, hashes: file.hashes, size: file.size });
    try {
      return await this.installArchive(archive, {
        name: name || project.title,
        managedPack: { provider: providerId, projectId: String(projectId), versionId: String(version.versionId) },
      });
    } finally { await fsp.rm(archive, { force: true }); }
  }

  async installArchive(archivePath, options = {}) {
    const stat = await fsp.stat(archivePath);
    if (stat.size > MAX_ARCHIVE_BYTES) throw new ValidationError('Modpack archive is too large');
    const zip = new AdmZip(archivePath);
    const extractedBytes = zip.getEntries().reduce((total, entry) => total + Number(entry.header?.size || 0), 0);
    if (extractedBytes > MAX_EXTRACTED_BYTES) {
      throw new ValidationError('Modpack expands beyond the safe extraction limit', { extractedBytes });
    }
    const modrinthIndex = zip.getEntry('modrinth.index.json');
    const curseIndex = zip.getEntry('manifest.json');
    if (modrinthIndex) return this.#installModrinth(zip, modrinthIndex, options);
    if (curseIndex) return this.#installCurseForge(zip, curseIndex, options);
    throw new IntegrityError('Unsupported modpack: expected modrinth.index.json or manifest.json');
  }

  async #installModrinth(zip, indexEntry, options) {
    const index = JSON.parse(indexEntry.getData().toString('utf8'));
    const minecraftVersion = index.dependencies?.minecraft;
    if (!minecraftVersion) throw new IntegrityError('Modrinth pack does not declare a Minecraft version');
    const loader = loaderFromDependencies(index.dependencies);
    const instance = await this.instances.create({
      name: options.name || index.name || 'Imported Modpack', minecraftVersion,
      ...loader, managedPack: options.managedPack || null,
    });
    try {
      await this.instances.withLock(instance.id, 'install-modpack', async () => {
        const files = (index.files || []).filter((file) => file.env?.client !== 'unsupported');
        let completed = 0;
        await Promise.all(files.map(async (file) => {
          if (file.fileSize > MAX_ENTRY_BYTES) throw new ValidationError('Modpack entry is too large', { path: file.path });
          const target = resolveInside(this.paths.instance(instance.id), file.path);
          assertNoSymlinkComponents(this.paths.instance(instance.id), target);
          await this.downloads.download({ urls: file.downloads, destination: target, hashes: file.hashes, size: file.fileSize });
          completed += 1;
          this.events.emit('modpack:progress', { instanceId: instance.id, completed, total: files.length });
        }));
        await this.#applyOverrides(zip, instance.id, ['overrides/', 'client-overrides/']);
      });
      return await this.instances.update(instance.id, { installState: 'ready' });
    } catch (error) {
      await this.instances.update(instance.id, { installState: 'broken' }).catch(() => undefined);
      throw error;
    }
  }

  async #installCurseForge(zip, indexEntry, options) {
    const index = JSON.parse(indexEntry.getData().toString('utf8'));
    const minecraftVersion = index.minecraft?.version;
    if (!minecraftVersion) throw new IntegrityError('CurseForge pack does not declare a Minecraft version');
    const loaderId = index.minecraft?.modLoaders?.find((loader) => loader.primary)?.id
      || index.minecraft?.modLoaders?.[0]?.id || '';
    const [rawLoader = 'vanilla', ...versionParts] = loaderId.split('-');
    const loader = rawLoader.toLowerCase().includes('neo') ? 'neoforge' : rawLoader.toLowerCase();
    const instance = await this.instances.create({
      name: options.name || index.name || 'Imported Modpack', minecraftVersion,
      loader: ['forge', 'fabric', 'quilt', 'neoforge'].includes(loader) ? loader : 'vanilla',
      loaderVersion: versionParts.join('-') || null,
      managedPack: options.managedPack || null,
    });
    try {
      const curseforge = this.providers.get('curseforge');
      await this.instances.withLock(instance.id, 'install-modpack', async () => {
        let completed = 0;
        await Promise.all((index.files || []).filter((file) => file.required !== false).map(async (entry) => {
          const version = await curseforge.version(String(entry.projectID), String(entry.fileID));
          const file = await curseforge.selectFile(version);
          const target = resolveInside(this.paths.instance(instance.id), 'mods', path.basename(file.filename));
          assertNoSymlinkComponents(this.paths.instance(instance.id), target);
          await this.downloads.download({ url: file.url, destination: target, hashes: file.hashes, size: file.size });
          completed += 1;
          this.events.emit('modpack:progress', { instanceId: instance.id, completed, total: index.files.length });
        }));
        await this.#applyOverrides(zip, instance.id, [`${index.overrides || 'overrides'}/`]);
      });
      return await this.instances.update(instance.id, { installState: 'ready' });
    } catch (error) {
      await this.instances.update(instance.id, { installState: 'broken' }).catch(() => undefined);
      throw error;
    }
  }

  async #applyOverrides(zip, instanceId, prefixes) {
    const root = this.paths.instance(instanceId);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const prefix = prefixes.find((candidate) => entry.entryName.startsWith(candidate));
      if (!prefix) continue;
      if (entry.header?.size > MAX_ENTRY_BYTES) throw new ValidationError('Override entry is too large', { path: entry.entryName });
      const relative = entry.entryName.slice(prefix.length);
      if (!relative) continue;
      const target = resolveInside(root, relative);
      assertNoSymlinkComponents(root, target);
      writeFileAtomicSync(target, entry.getData());
    }
  }
}

module.exports = { ModpackService, loaderFromDependencies, MAX_ARCHIVE_BYTES, MAX_EXTRACTED_BYTES };
