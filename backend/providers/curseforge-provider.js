'use strict';

const { ConfigurationError, NotFoundError } = require('../core/errors');

const MINECRAFT_GAME_ID = 432;
const LOADER_TYPES = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const RELEASE_TYPES = { 1: 'release', 2: 'beta', 3: 'alpha' };

class CurseForgeProvider {
  constructor(http, vault) {
    this.http = http;
    this.vault = vault;
    this.id = 'curseforge';
    this.base = 'https://api.curseforge.com/v1';
  }

  async setApiKey(value) {
    const key = String(value || '').trim();
    if (!key) await this.vault.delete('provider:curseforge:apiKey');
    else await this.vault.set('provider:curseforge:apiKey', key);
  }

  async configured() { return Boolean(await this.vault.get('provider:curseforge:apiKey')); }

  async #headers() {
    const key = await this.vault.get('provider:curseforge:apiKey');
    if (!key) {
      throw new ConfigurationError('CurseForge API key is not configured', {
        help: 'Request a third-party key from CurseForge and call providers.curseforge.setApiKey(key).',
      });
    }
    return { 'x-api-key': key };
  }

  async #json(pathname, options = {}) {
    return this.http.json(`${this.base}${pathname}`, {
      ...options, headers: { ...(await this.#headers()), ...(options.headers || {}) },
    });
  }

  async search({ query = '', minecraftVersion, loader, offset = 0, limit = 20 } = {}) {
    const parameters = new URLSearchParams({
      gameId: String(MINECRAFT_GAME_ID), searchFilter: query,
      index: String(offset), pageSize: String(Math.min(50, limit)), sortField: '2', sortOrder: 'desc',
    });
    if (minecraftVersion) parameters.set('gameVersion', minecraftVersion);
    if (loader && LOADER_TYPES[loader]) parameters.set('modLoaderType', String(LOADER_TYPES[loader]));
    const response = await this.#json(`/mods/search?${parameters}`);
    return {
      total: response.pagination?.totalCount || response.data.length,
      items: response.data.map((project) => this.#project(project)),
    };
  }

  async project(id) {
    const response = await this.#json(`/mods/${encodeURIComponent(id)}`);
    if (!response.data) throw new NotFoundError('CurseForge project', id);
    return this.#project(response.data);
  }

  #project(project) {
    return {
      provider: this.id,
      projectId: String(project.id),
      slug: project.slug,
      title: project.name,
      description: project.summary,
      author: project.authors?.map((author) => author.name).join(', ') || '',
      iconUrl: project.logo?.thumbnailUrl || project.logo?.url || null,
      downloads: project.downloadCount,
      projectType: 'mod',
      categories: project.categories?.map((category) => category.slug || category.name) || [],
      updatedAt: project.dateModified,
      websiteUrl: project.links?.websiteUrl,
    };
  }

  async versions(projectId, { minecraftVersion, loader, channels = ['release', 'beta', 'alpha'] } = {}) {
    const parameters = new URLSearchParams({ pageSize: '50' });
    if (minecraftVersion) parameters.set('gameVersion', minecraftVersion);
    if (loader && LOADER_TYPES[loader]) parameters.set('modLoaderType', String(LOADER_TYPES[loader]));
    const response = await this.#json(`/mods/${encodeURIComponent(projectId)}/files?${parameters}`);
    return response.data.filter((file) => channels.includes(RELEASE_TYPES[file.releaseType] || 'release')).map((file) => ({
      provider: this.id,
      projectId: String(file.modId),
      versionId: String(file.id),
      name: file.displayName,
      versionNumber: file.fileName,
      channel: RELEASE_TYPES[file.releaseType] || 'release',
      minecraftVersions: file.gameVersions || [],
      loaders: file.gameVersions?.map((value) => value.toLowerCase()).filter((value) => LOADER_TYPES[value]) || [],
      publishedAt: file.fileDate,
      dependencies: (file.dependencies || []).map((dependency) => ({
        projectId: String(dependency.modId),
        versionId: null,
        type: dependency.relationType === 3 ? 'required' : dependency.relationType === 2 ? 'optional' : 'embedded',
      })),
      files: [{
        filename: file.fileName,
        url: file.downloadUrl,
        size: file.fileLength,
        hashes: Object.fromEntries((file.hashes || []).map((hash) => [hash.algo === 1 ? 'sha1' : 'md5', hash.value])),
        primary: true,
      }],
    }));
  }

  async version(projectId, versionId) {
    const response = await this.#json(`/mods/${encodeURIComponent(projectId)}/files/${encodeURIComponent(versionId)}`);
    const file = response.data;
    if (!file) throw new NotFoundError('CurseForge file', versionId);
    return (await this.versions(projectId, {})).find((version) => version.versionId === String(versionId)) || {
      provider: this.id, projectId: String(projectId), versionId: String(versionId),
      name: file.displayName, versionNumber: file.fileName, channel: RELEASE_TYPES[file.releaseType] || 'release',
      minecraftVersions: file.gameVersions || [], loaders: [], publishedAt: file.fileDate,
      dependencies: [], files: [{ filename: file.fileName, url: file.downloadUrl, size: file.fileLength, hashes: {}, primary: true }],
    };
  }

  async selectFile(version) {
    const file = version.files[0];
    if (!file?.url) {
      const response = await this.#json(`/mods/${version.projectId}/files/${version.versionId}/download-url`);
      file.url = response.data;
    }
    if (!file.url) {
      throw new ConfigurationError('The author disabled third-party downloads for this CurseForge file', {
        projectId: version.projectId, versionId: version.versionId,
      });
    }
    return file;
  }
}

module.exports = { CurseForgeProvider, MINECRAFT_GAME_ID, LOADER_TYPES };
