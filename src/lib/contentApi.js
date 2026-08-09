import { cfHeaders } from './cfApi.js';

const CF_BASE = 'https://api.curseforge.com/v1';
const CF_LOADER = { Forge: 1, Fabric: 4, Quilt: 5, NeoForge: 6 };
const CF_RELEASE = { 1: 'release', 2: 'beta', 3: 'alpha' };

async function jsonRequest(url, options = {}, label = 'Content service') {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return response.json();
}

export function isCurseForgeProject(project) {
  return project?.source === 'cf' || String(project?.project_id ?? '').startsWith('cf:');
}

export function projectKey(project) {
  if (isCurseForgeProject(project)) {
    const id = project.cf_id ?? String(project.project_id).replace(/^cf:/, '');
    return `cf:${id}`;
  }
  return String(project?.project_id ?? project?.id ?? '');
}

function normalizeCurseForgeProject(project) {
  return {
    id: `cf:${project.id}`,
    project_id: `cf:${project.id}`,
    cf_id: project.id,
    source: 'cf',
    title: project.name,
    description: project.summary ?? '',
    icon_url: project.logo?.thumbnailUrl ?? project.logo?.url ?? null,
    author: project.authors?.[0]?.name ?? '',
    downloads: project.downloadCount ?? 0
  };
}

function normalizeModrinthProject(project) {
  return {
    ...project,
    id: project.id,
    project_id: project.id,
    source: 'modrinth',
    author: project.author ?? ''
  };
}

async function fetchCurseForgeProjects(ids, signal) {
  if (ids.length === 0) return [];
  const payload = await jsonRequest(`${CF_BASE}/mods`, {
    method: 'POST',
    headers: { ...cfHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ modIds: ids.map(Number), filterPcOnly: true }),
    signal
  }, 'CurseForge');
  return (payload.data ?? []).map(normalizeCurseForgeProject);
}

async function fetchModrinthProjects(ids, signal) {
  if (ids.length === 0) return [];
  const projects = await jsonRequest(
    `https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`,
    { signal },
    'Modrinth'
  );
  return (Array.isArray(projects) ? projects : []).map(normalizeModrinthProject);
}

export async function fetchProjectsByKeys(keys, { signal } = {}) {
  const unique = [...new Set(keys.filter(Boolean).map(String))];
  const modrinthIds = unique.filter((id) => !id.startsWith('cf:'));
  const curseForgeIds = unique
    .filter((id) => id.startsWith('cf:'))
    .map((id) => Number(id.slice(3)))
    .filter(Number.isFinite);

  const [modrinthResult, curseForgeResult] = await Promise.allSettled([
    fetchModrinthProjects(modrinthIds, signal),
    fetchCurseForgeProjects(curseForgeIds, signal)
  ]);
  if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');

  return [
    ...(modrinthResult.status === 'fulfilled' ? modrinthResult.value : []),
    ...(curseForgeResult.status === 'fulfilled' ? curseForgeResult.value : [])
  ];
}

function fallbackTitle(filename) {
  return String(filename || 'Unknown content')
    .replace(/\.(?:jar|zip)$/i, '')
    .replace(/[-_]+/g, ' ');
}

export async function hydrateInstalledProjects(installed, { signal } = {}) {
  const entries = Object.entries(installed ?? {});
  const missingKeys = entries
    .filter(([, entry]) => typeof entry === 'string' || !entry?.metadata?.title)
    .map(([key]) => key);
  const fetched = await fetchProjectsByKeys(missingKeys, { signal });
  const fetchedById = new Map(fetched.map((project) => [project.id, project]));

  return entries.map(([key, entry]) => {
    const record = typeof entry === 'string' ? { filename: entry, folder: 'mods' } : entry ?? {};
    const metadata = record.metadata ?? {};
    const remote = fetchedById.get(key);
    if (remote) return remote;
    return {
      id: key,
      project_id: key,
      cf_id: key.startsWith('cf:') ? Number(key.slice(3)) : undefined,
      source: metadata.source ?? (key.startsWith('cf:') ? 'cf' : 'modrinth'),
      title: metadata.title || fallbackTitle(record.filename),
      description: metadata.description ?? '',
      icon_url: metadata.iconUrl ?? null,
      author: metadata.author ?? '',
      downloads: 0
    };
  });
}

async function curseForgeDownloadUrl(modId, file, signal) {
  if (file.downloadUrl) return file.downloadUrl;
  const payload = await jsonRequest(
    `${CF_BASE}/mods/${modId}/files/${file.id}/download-url`,
    { headers: cfHeaders, signal },
    'CurseForge download service'
  );
  if (!payload?.data) throw new Error('This author does not allow third-party downloads');
  return payload.data;
}

async function curseForgeInstallPlan(mod, instance, signal) {
  const modId = Number(mod.cf_id ?? String(mod.project_id).replace(/^cf:/, ''));
  if (!Number.isFinite(modId)) throw new Error('Invalid CurseForge project ID');
  const loader = CF_LOADER[instance.loader];
  if (!loader) throw new Error(`CurseForge does not support the ${instance.loader} loader here`);

  const params = new URLSearchParams({
    gameVersion: instance.version,
    modLoaderType: String(loader),
    pageSize: '50'
  });
  const payload = await jsonRequest(`${CF_BASE}/mods/${modId}/files?${params}`, {
    headers: cfHeaders,
    signal
  }, 'CurseForge');
  const file = (payload.data ?? []).find((candidate) => candidate.isAvailable !== false);
  if (!file) throw new Error(`No ${instance.loader} build found for Minecraft ${instance.version}`);
  const url = await curseForgeDownloadUrl(modId, file, signal);

  const dependencyTypes = new Map();
  for (const dependency of file.dependencies ?? []) {
    if (![2, 3].includes(dependency.relationType)) continue;
    const existing = dependencyTypes.get(dependency.modId);
    if (!existing || dependency.relationType === 3) {
      dependencyTypes.set(dependency.modId, dependency.relationType);
    }
  }
  const projects = await fetchCurseForgeProjects([...dependencyTypes.keys()], signal);
  const byId = new Map(projects.map((project) => [project.cf_id, project]));
  const dependencies = [...dependencyTypes].map(([id, relationType]) => ({
    ...(byId.get(id) ?? {
      id: `cf:${id}`,
      project_id: `cf:${id}`,
      cf_id: id,
      source: 'cf',
      title: `CurseForge project ${id}`,
      description: '',
      icon_url: null,
      author: ''
    }),
    type: relationType === 3 ? 'required' : 'optional'
  }));

  const installFile = {
    url,
    filename: file.fileName,
    size: file.fileLength || file.fileSizeOnDisk || 0,
    version: file.displayName || String(file.id),
    channel: CF_RELEASE[file.releaseType] ?? 'release',
    published: file.fileDate
  };
  return {
    provider: 'curseforge',
    release: {
      name: file.displayName,
      number: file.displayName || String(file.id),
      channel: installFile.channel,
      published: file.fileDate,
      file: installFile
    },
    dependencies,
    mainMod: {
      ...mod,
      project_id: `cf:${modId}`,
      cf_id: modId,
      source: 'cf',
      installFile
    }
  };
}

async function modrinthInstallPlan(mod, instance, signal) {
  const query =
    `?game_versions=${encodeURIComponent(JSON.stringify([instance.version]))}` +
    `&loaders=${encodeURIComponent(JSON.stringify([instance.loader.toLowerCase()]))}` +
    '&include_changelog=false';
  const versions = await jsonRequest(
    `https://api.modrinth.com/v2/project/${mod.project_id}/version${query}`,
    { signal },
    'Modrinth'
  );
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error(`No ${instance.loader} build found for Minecraft ${instance.version}`);
  }
  const version = versions[0];
  const file = version.files?.find((candidate) => candidate.primary) ?? version.files?.[0];
  if (!file?.url) throw new Error('The compatible Modrinth release has no downloadable file');

  const dependencyTypes = new Map();
  for (const dependency of version.dependencies ?? []) {
    if (!dependency.project_id || !['required', 'optional'].includes(dependency.dependency_type)) continue;
    const existing = dependencyTypes.get(dependency.project_id);
    if (!existing || dependency.dependency_type === 'required') {
      dependencyTypes.set(dependency.project_id, dependency.dependency_type);
    }
  }
  const projects = await fetchModrinthProjects([...dependencyTypes.keys()], signal);
  const byId = new Map(projects.map((project) => [project.id, project]));
  const dependencies = [...dependencyTypes].map(([id, type]) => ({
    ...(byId.get(id) ?? {
      id,
      project_id: id,
      source: 'modrinth',
      title: id,
      description: '',
      icon_url: null,
      author: ''
    }),
    type
  }));
  const installFile = {
    url: file.url,
    filename: file.filename,
    size: file.size,
    version: version.version_number,
    channel: version.version_type,
    published: version.date_published
  };

  return {
    provider: 'modrinth',
    release: {
      name: version.name,
      number: version.version_number,
      channel: version.version_type,
      published: version.date_published,
      file: installFile
    },
    dependencies,
    mainMod: { ...mod, source: 'modrinth', installFile }
  };
}

export function getInstallPlan(mod, instance, { signal } = {}) {
  if (!instance || instance.loader === 'Vanilla') {
    return Promise.reject(new Error('Choose a Fabric, Forge, NeoForge, or Quilt instance'));
  }
  return isCurseForgeProject(mod)
    ? curseForgeInstallPlan(mod, instance, signal)
    : modrinthInstallPlan(mod, instance, signal);
}
