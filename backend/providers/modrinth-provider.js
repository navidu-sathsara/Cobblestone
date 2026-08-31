'use strict';

const { ConfigurationError, NotFoundError } = require('../core/errors');

class ModrinthProvider {
  constructor(http) {
    this.http = http;
    this.id = 'modrinth';
    this.base = 'https://api.modrinth.com/v2';
  }

  async search({
    query = '', minecraftVersion, loader, projectType = 'mod',
    index = 'relevance', offset = 0, limit = 20,
  } = {}) {
    const facets = [[`project_type:${projectType}`]];
    if (minecraftVersion) facets.push([`versions:${minecraftVersion}`]);
    if (loader && loader !== 'vanilla') facets.push([`categories:${loader}`]);
    const parameters = new URLSearchParams({
      query,
      index: ['relevance', 'downloads', 'follows', 'newest', 'updated'].includes(index) ? index : 'relevance',
      offset: String(offset), limit: String(Math.min(100, limit)), facets: JSON.stringify(facets),
    });
    const response = await this.http.json(`${this.base}/search?${parameters}`);
    return {
      total: response.total_hits,
      items: response.hits.map((project) => ({
        provider: this.id,
        projectId: project.project_id,
        slug: project.slug,
        title: project.title,
        description: project.description,
        author: project.author,
        iconUrl: project.icon_url,
        downloads: project.downloads,
        projectType: project.project_type,
        categories: project.categories || [],
        updatedAt: project.date_modified,
      })),
    };
  }

  async project(id) {
    const project = await this.http.json(`${this.base}/project/${encodeURIComponent(id)}`);
    return {
      provider: this.id, projectId: project.id, slug: project.slug, title: project.title,
      description: project.description, body: project.body, iconUrl: project.icon_url,
      downloads: project.downloads, projectType: project.project_type,
      clientSide: project.client_side, serverSide: project.server_side,
      categories: project.categories || [], sourceUrl: project.source_url,
    };
  }

  async versions(projectId, { minecraftVersion, loader, channels = ['release', 'beta', 'alpha'] } = {}) {
    const parameters = new URLSearchParams();
    if (minecraftVersion) parameters.set('game_versions', JSON.stringify([minecraftVersion]));
    if (loader && loader !== 'vanilla') parameters.set('loaders', JSON.stringify([loader]));
    const values = await this.http.json(`${this.base}/project/${encodeURIComponent(projectId)}/version?${parameters}`);
    return values.filter((version) => channels.includes(version.version_type)).map((version) => ({
      provider: this.id,
      projectId: version.project_id,
      versionId: version.id,
      name: version.name,
      versionNumber: version.version_number,
      channel: version.version_type,
      minecraftVersions: version.game_versions,
      loaders: version.loaders,
      publishedAt: version.date_published,
      dependencies: (version.dependencies || []).map((dependency) => ({
        projectId: dependency.project_id,
        versionId: dependency.version_id,
        type: dependency.dependency_type,
      })),
      files: version.files.map((file) => ({
        filename: file.filename, url: file.url, size: file.size, hashes: file.hashes,
        primary: file.primary,
      })),
    }));
  }

  async version(versionId) {
    const value = await this.http.json(`${this.base}/version/${encodeURIComponent(versionId)}`);
    const versions = await this.versions(value.project_id, {});
    const normalized = versions.find((version) => version.versionId === value.id);
    if (!normalized) throw new NotFoundError('Modrinth version', versionId);
    return normalized;
  }

  selectFile(version) {
    const file = version.files.find((candidate) => candidate.primary) || version.files[0];
    if (!file) throw new ConfigurationError('Modrinth version has no downloadable file', { versionId: version.versionId });
    return file;
  }

  async versionsFromHashes(hashes, algorithm = 'sha512') {
    if (!hashes.length) return {};
    return this.http.json(`${this.base}/version_files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hashes, algorithm }),
    });
  }
}

module.exports = { ModrinthProvider };
