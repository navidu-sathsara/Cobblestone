'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { install } = require('@xmcl/installer');

class InstallService {
  constructor(paths, settings, instances, versions, java, loaders, events) {
    Object.assign(this, { paths, settings, instances, versions, java, loaders, events });
  }

  installed(instanceId) {
    const instance = this.instances.get(instanceId);
    const versionId = instance.resolvedVersionId || instance.minecraftVersion;
    return fs.existsSync(path.join(this.paths.versions, versionId, `${versionId}.json`))
      && fs.existsSync(path.join(this.paths.versions, instance.minecraftVersion, `${instance.minecraftVersion}.jar`));
  }

  async install(instanceId, { repair = false } = {}) {
    return this.instances.withLock(instanceId, repair ? 'repair-game' : 'install-game', async () => {
      const instance = this.instances.get(instanceId);
      const javaPath = await this.java.ensureForMinecraft(instance.minecraftVersion, instance.overrides.javaPath);
      return this.installUnlocked(instance, javaPath, { repair });
    });
  }

  async installUnlocked(instance, javaPath, { repair = false } = {}) {
    const operation = repair ? 'repairing' : 'installing';
    await this.instances.update(instance.id, { installState: 'installing' });
    this.events.emit('game:install', { instanceId: instance.id, status: operation, phase: 'minecraft' });
    try {
      const entry = await this.versions.entry(instance.minecraftVersion);
      await install(entry, this.paths.game, {
        side: 'client',
        fetch: globalThis.fetch,
        librariesDownloadConcurrency: this.settings.get().downloads.concurrency,
        assetsDownloadConcurrency: this.settings.get().downloads.concurrency,
        throwErrorImmediately: false,
      });
      this.events.emit('game:install', { instanceId: instance.id, status: operation, phase: 'loader' });
      const resolved = await this.loaders.install(instance, javaPath);
      const updated = await this.instances.update(instance.id, {
        installState: 'ready',
        loaderVersion: resolved.loaderVersion,
        resolvedVersionId: resolved.versionId,
      });
      this.events.emit('game:install', {
        instanceId: instance.id, status: 'completed', versionId: resolved.versionId,
      });
      return updated;
    } catch (error) {
      await this.instances.update(instance.id, { installState: 'broken' }).catch(() => undefined);
      this.events.emit('game:install', { instanceId: instance.id, status: 'failed', error: error.message });
      throw error;
    }
  }
}

module.exports = { InstallService };
