'use strict';

const path = require('node:path');
const os = require('node:os');
const { z } = require('zod');
const { JsonStore } = require('../core/json-store');

const SettingsSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  memory: z.object({
    minimumMb: z.number().int().min(512).max(262144).default(1024),
    maximumMb: z.number().int().min(512).max(262144).default(4096),
    autoAdjust: z.boolean().default(true),
  }),
  java: z.object({
    autoManage: z.boolean().default(true),
    paths: z.record(z.string(), z.string()).default({}),
  }),
  game: z.object({
    width: z.number().int().min(320).max(16384).default(1280),
    height: z.number().int().min(240).max(16384).default(720),
    fullscreen: z.boolean().default(false),
    jvmArguments: z.array(z.string().max(512)).max(128).default([]),
    gameArguments: z.array(z.string().max(512)).max(128).default([]),
  }),
  downloads: z.object({
    concurrency: z.number().int().min(1).max(32).default(6),
    retries: z.number().int().min(0).max(12).default(3),
    timeoutMs: z.number().int().min(1000).max(3600000).default(120000),
    allowInsecureHttp: z.boolean().default(false),
  }),
  instances: z.object({
    autoBackupBeforeUpdates: z.boolean().default(true),
    backupRetention: z.number().int().min(1).max(100).default(10),
    keepFailedInstallations: z.boolean().default(false),
  }),
  mods: z.object({
    preferredProvider: z.enum(['modrinth', 'curseforge']).default('modrinth'),
    releaseChannels: z.array(z.enum(['release', 'beta', 'alpha'])).min(1).default(['release']),
    installRequiredDependencies: z.boolean().default(true),
    updatePinned: z.boolean().default(false),
  }),
  privacy: z.object({
    diagnosticsIncludePaths: z.boolean().default(false),
    networkLogging: z.boolean().default(false),
  }),
});

const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: 1,
  memory: {
    minimumMb: 1024,
    maximumMb: Math.max(2048, Math.min(4096, Math.floor(os.totalmem() / 1024 / 1024 / 2))),
    autoAdjust: true,
  },
  java: { autoManage: true, paths: {} },
  game: { width: 1280, height: 720, fullscreen: false, jvmArguments: [], gameArguments: [] },
  downloads: { concurrency: 6, retries: 3, timeoutMs: 120000, allowInsecureHttp: false },
  instances: { autoBackupBeforeUpdates: true, backupRetention: 10, keepFailedInstallations: false },
  mods: {
    preferredProvider: 'modrinth', releaseChannels: ['release'],
    installRequiredDependencies: true, updatePinned: false,
  },
  privacy: { diagnosticsIncludePaths: false, networkLogging: false },
});

function merge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return override ?? base;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(base?.[key] || {}, value)
      : value;
  }
  return result;
}

class SettingsService {
  constructor(paths, events) {
    this.events = events;
    this.store = new JsonStore(path.join(paths.state, 'settings.json'), DEFAULT_SETTINGS, {
      validate: (value) => SettingsSchema.parse(merge(DEFAULT_SETTINGS, value)),
    });
  }

  get() { return this.store.readSync(); }

  async set(next) {
    const saved = await this.store.write(merge(this.get(), next));
    this.events.emit('settings:changed', saved);
    return saved;
  }

  async reset() {
    const saved = await this.store.write(DEFAULT_SETTINGS);
    this.events.emit('settings:changed', saved);
    return saved;
  }
}

module.exports = { SettingsService, SettingsSchema, DEFAULT_SETTINGS, merge };
