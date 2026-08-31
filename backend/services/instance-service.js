'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { z } = require('zod');
const { JsonStore } = require('../core/json-store');
const { resolveInside } = require('../core/paths');
const { directorySize } = require('../core/files');
const { NotFoundError, ConflictError, ValidationError } = require('../core/errors');

const LoaderSchema = z.enum(['vanilla', 'fabric', 'forge', 'neoforge', 'quilt']);
const InstanceSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  name: z.string().trim().min(1).max(120),
  minecraftVersion: z.string().trim().min(1).max(80).refine((value) => !/[\\/\0]/.test(value), 'Invalid Minecraft version'),
  loader: LoaderSchema.default('vanilla'),
  loaderVersion: z.string().max(100).refine((value) => !/[\\/\0]/.test(value), 'Invalid loader version').nullable().default(null),
  resolvedVersionId: z.string().max(200).nullable().default(null),
  icon: z.string().max(4096).nullable().default(null),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  lastPlayedAt: z.number().int().nullable().default(null),
  playTimeSeconds: z.number().int().min(0).default(0),
  installState: z.enum(['new', 'installing', 'ready', 'broken']).default('new'),
  managedPack: z.object({
    provider: z.enum(['modrinth', 'curseforge']),
    projectId: z.string(),
    versionId: z.string(),
  }).nullable().default(null),
  overrides: z.object({
    memory: z.object({ minimumMb: z.number().int(), maximumMb: z.number().int() }).nullable().default(null),
    javaPath: z.string().nullable().default(null),
    jvmArguments: z.array(z.string()).nullable().default(null),
    gameArguments: z.array(z.string()).nullable().default(null),
    resolution: z.object({ width: z.number().int(), height: z.number().int(), fullscreen: z.boolean() }).nullable().default(null),
  }).default({ memory: null, javaPath: null, jvmArguments: null, gameArguments: null, resolution: null }),
});

function normalizeLoader(value) {
  const normalized = String(value || 'vanilla').toLowerCase();
  return normalized === 'neo forge' ? 'neoforge' : normalized;
}

function normalizeLegacy(instance) {
  const now = Date.now();
  return {
    id: String(instance.id),
    name: instance.name || instance.id,
    minecraftVersion: instance.minecraftVersion || instance.version,
    loader: normalizeLoader(instance.loader),
    loaderVersion: instance.loaderVersion || null,
    resolvedVersionId: instance.resolvedVersionId || null,
    icon: instance.icon || null,
    createdAt: instance.createdAt || instance.created || now,
    updatedAt: instance.updatedAt || now,
    lastPlayedAt: instance.lastPlayedAt || instance.lastPlayed || null,
    playTimeSeconds: instance.playTimeSeconds || 0,
    installState: instance.installState || 'new',
    managedPack: instance.managedPack || instance.pack || null,
    overrides: {
      memory: instance.overrides?.memory?.enabled ? {
        minimumMb: Number(instance.overrides.memory.min) * 1024,
        maximumMb: Number(instance.overrides.memory.max) * 1024,
      } : instance.overrides?.memory || null,
      javaPath: instance.overrides?.java?.enabled ? instance.overrides.java.path : instance.overrides?.javaPath || null,
      jvmArguments: instance.overrides?.jvmArguments || null,
      gameArguments: instance.overrides?.gameArguments || null,
      resolution: instance.overrides?.resolution?.enabled
        ? { ...instance.overrides.resolution, fullscreen: Boolean(instance.overrides.resolution.fullscreen) }
        : instance.overrides?.resolution || null,
    },
  };
}

class InstanceService {
  constructor(paths, events) {
    this.paths = paths;
    this.events = events;
    this.operationLocks = new Map();
    this.store = new JsonStore(path.join(paths.state, 'instances.json'), { schemaVersion: 2, instances: [], trash: [] }, {
      validate: (value) => ({
        schemaVersion: 2,
        instances: (value?.instances || []).map(normalizeLegacy).map((item) => InstanceSchema.parse(item)),
        trash: Array.isArray(value?.trash) ? value.trash : [],
      }),
    });
  }

  list() { return this.store.readSync().instances; }

  deleted() {
    return this.store.readSync().trash.map(({ instance, deletedAt }) => ({ instance, deletedAt }));
  }

  get(id) {
    const instance = this.list().find((item) => item.id === id);
    if (!instance) throw new NotFoundError('Instance', id);
    return instance;
  }

  async create(input) {
    const now = Date.now();
    const instance = InstanceSchema.parse({
      id: input.id || crypto.randomUUID(),
      name: input.name,
      minecraftVersion: input.minecraftVersion || input.version,
      loader: normalizeLoader(input.loader),
      loaderVersion: input.loaderVersion || null,
      resolvedVersionId: input.resolvedVersionId || null,
      icon: input.icon || null,
      createdAt: now, updatedAt: now, lastPlayedAt: null, playTimeSeconds: 0,
      installState: 'new', managedPack: input.managedPack || null,
      overrides: input.overrides || undefined,
    });
    await this.store.update((data) => {
      if (data.instances.some((item) => item.id === instance.id)) {
        throw new ConflictError('An instance with this ID already exists', { id: instance.id });
      }
      data.instances.push(instance);
    });
    for (const folder of ['mods', 'config', 'resourcepacks', 'shaderpacks', 'saves', 'logs']) {
      fs.mkdirSync(resolveInside(this.paths.instance(instance.id), folder), { recursive: true });
    }
    this.events.emit('instance:created', instance);
    return instance;
  }

  async update(id, patch) {
    let updated;
    await this.store.update((data) => {
      const index = data.instances.findIndex((item) => item.id === id);
      if (index < 0) throw new NotFoundError('Instance', id);
      updated = InstanceSchema.parse({
        ...data.instances[index], ...patch, id,
        loader: patch.loader ? normalizeLoader(patch.loader) : data.instances[index].loader,
        updatedAt: Date.now(),
      });
      data.instances[index] = updated;
    });
    this.events.emit('instance:updated', updated);
    return updated;
  }

  async duplicate(id, name) {
    return this.withLock(id, 'duplicate-instance', () => this.#duplicateUnlocked(id, name));
  }

  async #duplicateUnlocked(id, name) {
    const source = this.get(id);
    const copy = await this.create({ ...source, id: crypto.randomUUID(), name: name || `${source.name} Copy` });
    try {
      await fsp.cp(this.paths.instance(id), this.paths.instance(copy.id), { recursive: true, force: false });
      return await this.update(copy.id, { installState: source.installState, managedPack: source.managedPack });
    } catch (error) {
      await this.delete(copy.id, { permanent: true });
      throw error;
    }
  }

  async delete(id, { permanent = false } = {}) {
    const instance = this.get(id);
    if (this.operationLocks.has(id)) throw new ConflictError('Instance is busy', { id });
    const source = this.paths.instance(id);
    if (!permanent && fs.existsSync(source)) {
      const trashName = `${Date.now()}-${id}`;
      await fsp.mkdir(this.paths.trash, { recursive: true });
      await fsp.rename(source, resolveInside(this.paths.trash, trashName));
      await this.store.update((data) => {
        data.trash.push({ instance, trashName, deletedAt: Date.now() });
        data.instances = data.instances.filter((item) => item.id !== id);
      });
    } else {
      await fsp.rm(source, { recursive: true, force: true });
      await this.store.update((data) => { data.instances = data.instances.filter((item) => item.id !== id); });
    }
    this.events.emit('instance:deleted', { id, permanent });
  }

  async restore(id) {
    let record;
    await this.store.update((data) => {
      const index = data.trash.findIndex((item) => item.instance?.id === id);
      if (index < 0) throw new NotFoundError('Deleted instance', id);
      record = data.trash[index];
      if (data.instances.some((item) => item.id === id)) throw new ConflictError('Instance ID is already in use', { id });
      data.trash.splice(index, 1);
      data.instances.push({ ...record.instance, updatedAt: Date.now() });
    });
    await fsp.rename(resolveInside(this.paths.trash, record.trashName), this.paths.instance(id));
    this.events.emit('instance:restored', record.instance);
    return this.get(id);
  }

  async recordPlay(id, startedAt, endedAt = Date.now()) {
    const duration = Math.max(0, Math.round((endedAt - startedAt) / 1000));
    const current = this.get(id);
    return this.update(id, {
      lastPlayedAt: startedAt,
      playTimeSeconds: current.playTimeSeconds + duration,
    });
  }

  directory(id, subpath = '') { return resolveInside(this.paths.instance(id), subpath); }

  listFiles(id, subpath = '') {
    const directory = this.directory(id, subpath);
    try {
      return fs.readdirSync(directory, { withFileTypes: true }).map((entry) => {
        const stat = fs.statSync(resolveInside(directory, entry.name));
        return { name: entry.name, directory: entry.isDirectory(), size: stat.size, modifiedAt: stat.mtimeMs };
      });
    } catch { return []; }
  }

  worlds(id) {
    return this.listFiles(id, 'saves').filter((entry) => entry.directory).map((entry) => ({
      ...entry,
      size: directorySize(resolveInside(this.directory(id, 'saves'), entry.name)),
    })).sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  async deleteWorld(id, worldName) {
    const saves = this.directory(id, 'saves');
    const source = resolveInside(saves, worldName);
    if (source === saves || !fs.existsSync(source)) throw new NotFoundError('World', worldName);
    const trash = this.directory(id, path.join('.trash', 'worlds'));
    await fsp.mkdir(trash, { recursive: true });
    const trashName = `${Date.now()}-${crypto.randomUUID()}`;
    const destination = resolveInside(trash, trashName);
    await fsp.rename(source, destination);
    await fsp.writeFile(`${destination}.json`, JSON.stringify({ worldName, deletedAt: Date.now() }));
    this.events.emit('world:deleted', { instanceId: id, worldName, trashName });
    return { worldName, trashName };
  }

  deletedWorlds(id) {
    const trash = this.directory(id, path.join('.trash', 'worlds'));
    try {
      return fs.readdirSync(trash, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => {
          const trashName = entry.name.slice(0, -5);
          return { trashName, ...JSON.parse(fs.readFileSync(resolveInside(trash, entry.name), 'utf8')) };
        }).sort((a, b) => b.deletedAt - a.deletedAt);
    } catch { return []; }
  }

  async restoreWorld(id, trashName, targetName = null) {
    const trash = this.directory(id, path.join('.trash', 'worlds'));
    const source = resolveInside(trash, trashName);
    const metadataPath = resolveInside(trash, `${trashName}.json`);
    if (!fs.existsSync(source) || !fs.existsSync(metadataPath)) throw new NotFoundError('Deleted world', trashName);
    const metadata = JSON.parse(await fsp.readFile(metadataPath, 'utf8'));
    const name = String(targetName || metadata.worldName || '').trim();
    if (!name) throw new ValidationError('A world name is required');
    const destination = resolveInside(this.directory(id, 'saves'), name);
    if (fs.existsSync(destination)) throw new ConflictError('A world with this name already exists', { name });
    await fsp.rename(source, destination);
    await fsp.rm(metadataPath, { force: true });
    this.events.emit('world:restored', { instanceId: id, worldName: name });
    return { worldName: name };
  }

  readLog(id, { lines = 800, maxBytes = 4 * 1024 * 1024 } = {}) {
    const log = this.directory(id, path.join('logs', 'latest.log'));
    try {
      const stat = fs.statSync(log);
      const length = Math.min(stat.size, maxBytes);
      const descriptor = fs.openSync(log, 'r');
      const buffer = Buffer.alloc(length);
      fs.readSync(descriptor, buffer, 0, length, stat.size - length);
      fs.closeSync(descriptor);
      return buffer.toString('utf8').split(/\r?\n/).slice(-lines).join('\n');
    } catch { return null; }
  }

  crashReports(id) {
    return this.listFiles(id, 'crash-reports')
      .filter((entry) => !entry.directory && entry.name.endsWith('.txt'))
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  async withLock(id, operation, action) {
    const release = this.acquireLock(id, operation);
    try { return await action(); } finally { release(); }
  }

  acquireLock(id, operation) {
    this.get(id);
    if (this.operationLocks.has(id)) {
      throw new ConflictError('Instance is already busy', { id, operation, active: this.operationLocks.get(id) });
    }
    this.operationLocks.set(id, operation);
    this.events.emit('instance:operation', { id, operation, status: 'started' });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.operationLocks.delete(id);
      this.events.emit('instance:operation', { id, operation, status: 'finished' });
    };
  }

  busy(id) { return this.operationLocks.get(id) || null; }

  assertContentFolder(folder) {
    if (!['mods', 'resourcepacks', 'shaderpacks', 'datapacks'].includes(folder)) {
      throw new ValidationError('Unsupported instance content folder', { folder });
    }
  }
}

module.exports = { InstanceService, InstanceSchema, LoaderSchema, normalizeLoader };
