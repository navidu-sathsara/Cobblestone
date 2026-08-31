'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomicSync } = require('../core/files');
const { NotFoundError } = require('../core/errors');
const { resolveInside } = require('../core/paths');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const CACHE_TTL = 15 * 60_000;

class VersionService {
  constructor(paths, http) {
    this.paths = paths;
    this.http = http;
    this.manifestPath = path.join(paths.metadata, 'minecraft-versions.json');
    this.manifestCache = null;
    this.versionCache = new Map();
  }

  #readCachedManifest() {
    try { return JSON.parse(fs.readFileSync(this.manifestPath, 'utf8')); } catch { return null; }
  }

  async manifest({ force = false } = {}) {
    const cached = this.manifestCache || this.#readCachedManifest();
    if (!force && cached?.versions?.length && Date.now() - (cached.cachedAt || 0) < CACHE_TTL) {
      this.manifestCache = cached;
      return cached;
    }
    try {
      const fresh = await this.http.json(MANIFEST_URL, { retries: 3 });
      this.manifestCache = { ...fresh, cachedAt: Date.now() };
      writeFileAtomicSync(this.manifestPath, JSON.stringify(this.manifestCache));
      return this.manifestCache;
    } catch (error) {
      if (cached?.versions?.length) return cached;
      throw error;
    }
  }

  async list({ types = ['release'], limit = 0, force = false } = {}) {
    const manifest = await this.manifest({ force });
    const selected = manifest.versions.filter((version) => types.includes(version.type));
    return limit > 0 ? selected.slice(0, limit) : selected;
  }

  async metadata(id) {
    if (this.versionCache.has(id)) return this.versionCache.get(id);
    const diskPath = resolveInside(this.paths.metadata, 'versions', `${id}.json`);
    try {
      const value = JSON.parse(fs.readFileSync(diskPath, 'utf8'));
      this.versionCache.set(id, value);
      return value;
    } catch { /* fetch below */ }
    const manifest = await this.manifest();
    const entry = manifest.versions.find((version) => version.id === id);
    if (!entry) throw new NotFoundError('Minecraft version', id);
    const value = await this.http.json(entry.url, { retries: 3 });
    writeFileAtomicSync(diskPath, JSON.stringify(value));
    this.versionCache.set(id, value);
    return value;
  }

  async entry(id) {
    const manifest = await this.manifest();
    const entry = manifest.versions.find((version) => version.id === id);
    if (!entry) throw new NotFoundError('Minecraft version', id);
    return entry;
  }

  async requiredJava(id) {
    const metadata = await this.metadata(id);
    return metadata.javaVersion?.majorVersion || this.fallbackJava(id);
  }

  fallbackJava(id) {
    const match = String(id).match(/^1\.(\d+)(?:\.(\d+))?/);
    if (!match) return 21;
    const minor = Number(match[1]);
    const patch = Number(match[2] || 0);
    if (minor >= 21) return 21;
    if (minor === 20 && patch >= 5) return 21;
    if (minor >= 18) return 17;
    return 8;
  }

  installedProfiles() {
    try {
      return fs.readdirSync(this.paths.versions, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => fs.existsSync(path.join(this.paths.versions, entry.name, `${entry.name}.json`)))
        .map((entry) => entry.name);
    } catch { return []; }
  }
}

module.exports = { VersionService, MANIFEST_URL };
