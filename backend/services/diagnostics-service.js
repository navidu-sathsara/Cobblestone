'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { directorySize } = require('../core/files');

class DiagnosticsService {
  constructor(paths, settings, versions, java, instances, mods, providers, http) {
    Object.assign(this, { paths, settings, versions, java, instances, mods, providers, http });
  }

  async doctor({ network = true } = {}) {
    const checks = [];
    const check = async (name, operation) => {
      const startedAt = Date.now();
      try {
        const details = await operation();
        checks.push({ name, ok: true, durationMs: Date.now() - startedAt, details });
      } catch (error) {
        checks.push({ name, ok: false, durationMs: Date.now() - startedAt, error: error.message, code: error.code });
      }
    };
    await check('data-directory', async () => {
      const probe = path.join(this.paths.state, `.write-test-${process.pid}`);
      await fsp.writeFile(probe, 'ok');
      await fsp.rm(probe);
      return { writable: true };
    });
    await check('settings', async () => ({ schemaVersion: this.settings.get().schemaVersion }));
    await check('instances', async () => ({ count: this.instances.list().length }));
    await check('java', async () => ({ runtimes: (await this.java.detect()).map((item) => ({ version: item.version, major: item.major })) }));
    if (network) {
      await check('minecraft-metadata', async () => ({ versions: (await this.versions.list({ limit: 1 })).length }));
      await check('modrinth', async () => ({ total: (await this.providers.search('modrinth', { query: 'fabric api', limit: 1 })).total }));
      await check('curseforge', async () => ({ configured: await this.providers.get('curseforge').configured() }));
    }
    return {
      ok: checks.every((item) => item.ok),
      generatedAt: new Date().toISOString(),
      runtime: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length },
      checks,
    };
  }

  storage() {
    return [
      ['instances', this.paths.instances], ['assets', this.paths.assets], ['libraries', this.paths.libraries],
      ['versions', this.paths.versions], ['java', this.paths.java], ['cache', this.paths.cache],
      ['downloads', this.paths.downloads], ['backups', this.paths.backups], ['trash', this.paths.trash],
    ].map(([key, directory]) => ({ key, directory, bytes: directorySize(directory) }));
  }

  async verifyInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    const content = await this.mods.verify(instanceId);
    const profileCandidates = this.versions.installedProfiles().filter((profile) => profile.includes(instance.minecraftVersion));
    return {
      instanceId, valid: content.every((item) => item.valid) && profileCandidates.length > 0,
      content, profiles: profileCandidates, unmanaged: this.mods.scanUnmanaged(instanceId),
    };
  }

  async cleanup({ partialOlderThanMs = 7 * 24 * 60 * 60_000 } = {}) {
    const removed = [];
    const threshold = Date.now() - partialOlderThanMs;
    const scan = async (directory) => {
      let entries = [];
      try { entries = await fsp.readdir(directory, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) await scan(full);
        else if ((entry.name.endsWith('.part') || entry.name.includes('.staging-')) && (await fsp.stat(full)).mtimeMs < threshold) {
          await fsp.rm(full, { force: true });
          removed.push(full);
        }
      }
    };
    await scan(this.paths.downloads);
    await scan(this.paths.cache);
    return { removed };
  }

  supportSnapshot() {
    const includePaths = this.settings.get().privacy.diagnosticsIncludePaths;
    const sanitize = (value) => includePaths ? value : path.basename(value);
    return {
      generatedAt: new Date().toISOString(),
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      settings: { ...this.settings.get(), java: { ...this.settings.get().java, paths: {} } },
      instances: this.instances.list().map((instance) => ({ ...instance, icon: null })),
      storage: this.storage().map((item) => ({ ...item, directory: sanitize(item.directory) })),
    };
  }
}

module.exports = { DiagnosticsService };
