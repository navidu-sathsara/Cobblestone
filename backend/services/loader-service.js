'use strict';

const { NotFoundError, ConfigurationError } = require('../core/errors');
const {
  installFabric,
  installForge,
  installNeoForged,
  installQuiltVersion,
} = require('@xmcl/installer');

const FABRIC_META = 'https://meta.fabricmc.net/v2';
const QUILT_META = 'https://meta.quiltmc.org/v3';
const FORGE_META = 'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json';
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const NEOFORGE_META = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';

function neoforgeMatches(minecraftVersion, loaderVersion) {
  const minecraft = String(minecraftVersion).match(/^1\.(\d+)\.(\d+)/);
  const loader = String(loaderVersion).match(/^(\d+)\.(\d+)\./);
  return Boolean(minecraft && loader && minecraft[1] === loader[1] && minecraft[2] === loader[2]);
}

class LoaderService {
  constructor(paths, http, downloads, events) {
    this.paths = paths;
    this.http = http;
    this.downloads = downloads;
    this.events = events;
    this.cache = new Map();
  }

  async versions(loader, minecraftVersion, { force = false } = {}) {
    const key = `${loader}:${minecraftVersion}`;
    if (!force && this.cache.has(key)) return this.cache.get(key);
    let values;
    if (loader === 'vanilla') values = [{ version: minecraftVersion, stable: true }];
    else if (loader === 'fabric') {
      const response = await this.http.json(`${FABRIC_META}/versions/loader/${encodeURIComponent(minecraftVersion)}`);
      values = response.map((item) => ({ version: item.loader.version, stable: Boolean(item.loader.stable) }));
    } else if (loader === 'quilt') {
      const response = await this.http.json(`${QUILT_META}/versions/loader/${encodeURIComponent(minecraftVersion)}`);
      values = response.map((item) => ({
        version: item.loader.version,
        stable: !/(?:alpha|beta|rc|snapshot)/i.test(item.loader.version),
      }));
    } else if (loader === 'forge') {
      const response = await this.http.json(FORGE_META);
      const raw = response[minecraftVersion] || response.versions?.[minecraftVersion] || [];
      values = raw.map((version) => ({
        version: String(version).startsWith(`${minecraftVersion}-`) ? String(version).slice(minecraftVersion.length + 1) : String(version),
        stable: true,
      })).reverse();
    } else if (loader === 'neoforge') {
      const response = await this.http.json(NEOFORGE_META);
      values = (response.versions || response || [])
        .filter((version) => neoforgeMatches(minecraftVersion, version))
        .map((version) => ({ version, stable: !String(version).includes('beta') })).reverse();
    } else throw new ConfigurationError('Unsupported mod loader', { loader });
    this.cache.set(key, values);
    return values;
  }

  async resolve(instance) {
    const loader = instance.loader || 'vanilla';
    if (loader === 'vanilla') return {};
    const available = await this.versions(loader, instance.minecraftVersion);
    const selected = instance.loaderVersion
      ? available.find((item) => item.version === instance.loaderVersion)
      : available.find((item) => item.stable) || available[0];
    if (!selected) throw new NotFoundError(`${loader} loader for Minecraft ${instance.minecraftVersion}`, instance.loaderVersion);

    return { loader, loaderVersion: selected.version };
  }

  async install(instance, javaPath) {
    const selected = await this.resolve(instance);
    if (selected.loader === 'vanilla') return {
      versionId: instance.minecraftVersion,
      loaderVersion: null,
    };
    const details = {
      loader: selected.loader,
      minecraftVersion: instance.minecraftVersion,
      version: selected.loaderVersion,
    };
    this.events.emit('loader:install', { ...details, status: 'installing' });
    let versionId;
    if (selected.loader === 'fabric') {
      versionId = await installFabric({
        minecraftVersion: instance.minecraftVersion,
        version: selected.loaderVersion,
        minecraft: this.paths.game,
        fetch: globalThis.fetch,
      });
    } else if (selected.loader === 'quilt') {
      versionId = await installQuiltVersion({
        minecraftVersion: instance.minecraftVersion,
        version: selected.loaderVersion,
        minecraft: this.paths.game,
        fetch: globalThis.fetch,
      });
    } else if (selected.loader === 'forge') {
      versionId = await installForge(
        { mcversion: instance.minecraftVersion, version: selected.loaderVersion },
        this.paths.game,
        { java: javaPath, mavenHost: 'https://maven.minecraftforge.net' },
      );
    } else if (selected.loader === 'neoforge') {
      versionId = await installNeoForged('neoforge', selected.loaderVersion, this.paths.game, {
        java: javaPath,
        mavenHost: 'https://maven.neoforged.net/releases',
      });
    }
    this.events.emit('loader:install', { ...details, status: 'completed', versionId });
    return { versionId, loaderVersion: selected.loaderVersion };
  }

  async recommended(loader, minecraftVersion) {
    if (loader !== 'forge') return (await this.versions(loader, minecraftVersion)).find((item) => item.stable) || null;
    const promos = await this.http.json(FORGE_PROMOS);
    const version = promos.promos?.[`${minecraftVersion}-recommended`] || promos.promos?.[`${minecraftVersion}-latest`];
    return version ? { version, stable: true } : null;
  }
}

module.exports = { LoaderService, neoforgeMatches };
