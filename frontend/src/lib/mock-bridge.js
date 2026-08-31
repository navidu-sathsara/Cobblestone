/**
 * Browser-only stand-in for the Electron preload bridge.
 *
 * `pnpm --filter cobblestone-frontend dev` can be opened in a plain browser to
 * work on the home page without building the desktop shell. In that mode there
 * is no `window.cobblestone`, so this module answers with the same shapes the
 * real backend returns, seeded with the values from the design reference.
 */

const MOCK_ACCOUNT = {
  id: 'mock-magmad',
  type: 'microsoft',
  username: 'MagMad',
  uuid: 'e5a4b1c07f7b4a1e9a3d2c6f8b0e1d24',
  createdAt: Date.now() - 86_400_000,
  lastAuthenticatedAt: Date.now() - 3_600_000,
};

const MOCK_INSTANCE = {
  id: 'mock-instance',
  name: 'Cobblestone',
  minecraftVersion: '1.21.11',
  loader: 'fabric',
  loaderVersion: '0.17.2',
  resolvedVersionId: 'fabric-loader-0.17.2-1.21.11',
  icon: null,
  createdAt: Date.now() - 86_400_000,
  updatedAt: Date.now(),
  lastPlayedAt: Date.now() - 7_200_000,
  playTimeSeconds: 18_420,
  installState: 'ready',
  managedPack: null,
  overrides: {
    memory: null, javaPath: null, jvmArguments: null, gameArguments: null, resolution: null,
  },
};

const MOCK_INSTANCES = [
  MOCK_INSTANCE,
  {
    ...MOCK_INSTANCE,
    id: 'mock-instance-forge',
    name: 'Iron & Steam',
    loader: 'forge',
    loaderVersion: '47.3.0',
    resolvedVersionId: 'forge-1.20.1-47.3.0',
    minecraftVersion: '1.20.1',
    playTimeSeconds: 4_260,
    lastPlayedAt: Date.now() - 3 * 86_400_000,
  },
  {
    ...MOCK_INSTANCE,
    id: 'mock-instance-vanilla',
    name: 'Snapshot Sandbox',
    loader: 'vanilla',
    loaderVersion: null,
    resolvedVersionId: null,
    minecraftVersion: '1.21.11',
    playTimeSeconds: 0,
    lastPlayedAt: null,
    installState: 'new',
  },
];

/** Player counts from the reference mockup, so the preview matches the design. */
const MOCK_PLAYERS = {
  'mc.hypixel.net': 35_000,
  'mineplex.com': 400,
  'mccisland.net': 550,
  'donutsmp.net': 32_000,
  'mc.hoplite.gg': 2_100,
};

const MOCK_PROJECTS = [
  { provider: 'modrinth', projectId: 'sodium', slug: 'sodium', title: 'Sodium', description: 'A modern rendering engine for Minecraft.', author: 'CaffeineMC', iconUrl: null, downloads: 87_000_000, projectType: 'mod', categories: ['fabric', 'optimization'], updatedAt: new Date().toISOString() },
  { provider: 'modrinth', projectId: 'iris', slug: 'iris', title: 'Iris Shaders', description: 'A modern shaders mod with excellent performance.', author: 'IrisShaders', iconUrl: null, downloads: 42_000_000, projectType: 'mod', categories: ['fabric', 'shaders'], updatedAt: new Date().toISOString() },
  { provider: 'modrinth', projectId: 'fabulously-optimized', slug: 'fabulously-optimized', title: 'Fabulously Optimized', description: 'A performance-focused Fabric modpack.', author: 'FabulouslyOptimized', iconUrl: null, downloads: 12_000_000, projectType: 'modpack', categories: ['fabric', 'optimization'], updatedAt: new Date().toISOString() },
  { provider: 'modrinth', projectId: 'stay-true', slug: 'stay-true', title: 'Stay True', description: 'A visual remaster of the default resource pack.', author: 'Trrig', iconUrl: null, downloads: 9_000_000, projectType: 'resourcepack', categories: ['16x'], updatedAt: new Date().toISOString() },
  { provider: 'modrinth', projectId: 'complementary', slug: 'complementary', title: 'Complementary Shaders', description: 'High quality shaders with great performance.', author: 'EminGTR', iconUrl: null, downloads: 15_000_000, projectType: 'shader', categories: ['fantasy', 'vanilla-like'], updatedAt: new Date().toISOString() },
  { provider: 'modrinth', projectId: 'terralith', slug: 'terralith', title: 'Terralith', description: 'Overhauls world generation with new biomes and terrain.', author: 'Stardust Labs', iconUrl: null, downloads: 20_000_000, projectType: 'datapack', categories: ['worldgen'], updatedAt: new Date().toISOString() },
];

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export function createMockBridge() {
  const listeners = new Map();
  const accounts = [MOCK_ACCOUNT];
  let activeId = MOCK_ACCOUNT.id;
  let running = null;
  let instances = MOCK_INSTANCES.map((item) => ({ ...item }));
  let deletedInstances = [];
  let installedContent = [
    {
      key: 'modrinth:sodium', provider: 'modrinth', projectId: 'sodium', versionId: 'mock-sodium-version',
      title: 'Sodium', versionNumber: '0.6.13', filename: 'sodium.jar', folder: 'mods', hashes: {},
      size: 1_200_000, enabled: true, pinned: false, installedAt: Date.now(), updatedAt: Date.now(), dependencies: [],
    },
  ];
  let backups = [];

  const emit = (name, payload) => {
    for (const listener of listeners.get(name) || []) listener(payload);
  };

  const state = (status, detail) => emit('game:state', {
    instanceId: MOCK_INSTANCE.id, launchId: 'mock-launch', status, detail,
  });

  return {
    isDesktop: false,

    status: async () => ({
      name: 'Cobblestone',
      version: '4.1.0',
      dataDirectory: '~/.cobblestone',
      runningGames: running ? [running] : [],
      downloads: [],
      instances: instances.length,
      accounts: accounts.length,
      providers: ['modrinth', 'curseforge'],
    }),

    settings: {
      get: async () => ({ memory: { minimumMb: 1024, maximumMb: 4096 } }),
    },

    accounts: {
      list: async () => ({ schemaVersion: 1, activeId, accounts: [...accounts] }),
      loginMicrosoft: async () => {
        await delay(400);
        throw Object.assign(new Error('Microsoft sign-in needs the desktop shell'), {
          code: 'AUTHENTICATION_ERROR',
        });
      },
      addOffline: async (username) => {
        const account = {
          id: `offline-${username}`, type: 'offline', username, uuid: null,
          createdAt: Date.now(), lastAuthenticatedAt: null,
        };
        accounts.push(account);
        activeId = account.id;
        emit('auth:changed', { activeId, accounts: [...accounts] });
        return account;
      },
      setActive: async (id) => {
        activeId = id;
        emit('auth:changed', { activeId, accounts: [...accounts] });
        return accounts.find((item) => item.id === id);
      },
    },

    versions: {
      // Mirrors VersionService#list: newest-first manifest entries.
      list: async () => [{ id: '1.21.11', type: 'release', url: '' }],
    },

    loaders: {
      list: async (loader, minecraftVersion) => (
        loader === 'vanilla' ? [{ version: minecraftVersion, stable: true }] : [
          { version: loader === 'fabric' ? '0.17.2' : '1.0.0', stable: true },
        ]
      ),
    },

    instances: {
      list: async () => instances.map((item) => ({ ...item })),
      create: async (payload = {}) => {
        const created = {
          ...MOCK_INSTANCE, ...payload, id: `mock-${Date.now()}`, createdAt: Date.now(), updatedAt: Date.now(),
          lastPlayedAt: null, playTimeSeconds: 0, installState: 'new', managedPack: payload.managedPack || null,
        };
        instances = [created, ...instances];
        emit('instance:created', created);
        return created;
      },
      update: async (id, patch) => {
        let updated;
        instances = instances.map((item) => {
          if (item.id !== id) return item;
          updated = { ...item, ...patch, id, updatedAt: Date.now() };
          return updated;
        });
        emit('instance:updated', updated);
        return updated;
      },
      duplicate: async (id, name) => {
        const source = instances.find((item) => item.id === id);
        const copy = { ...source, id: `mock-${Date.now()}`, name: name || `${source.name} Copy`, createdAt: Date.now() };
        instances = [copy, ...instances];
        emit('instance:created', copy);
        return copy;
      },
      delete: async (id) => {
        const instance = instances.find((item) => item.id === id);
        if (instance) deletedInstances = [{ instance, deletedAt: Date.now() }, ...deletedInstances];
        instances = instances.filter((item) => item.id !== id);
        emit('instance:deleted', { id, permanent: false });
        return true;
      },
      deleted: async () => deletedInstances.map((item) => ({ ...item, instance: { ...item.instance } })),
      restore: async (id) => {
        const record = deletedInstances.find((item) => item.instance.id === id);
        if (!record) return null;
        deletedInstances = deletedInstances.filter((item) => item.instance.id !== id);
        instances = [record.instance, ...instances];
        emit('instance:restored', record.instance);
        return record.instance;
      },
      openFolder: async () => true,
      worlds: async () => [{ name: 'Survival World', directory: true, size: 48_000_000, modifiedAt: Date.now() - 86_400_000 }],
      readLog: async () => '[main/INFO]: Mock Minecraft log\n[main/INFO]: Instance is ready',
      crashReports: async () => [],
    },

    installation: {
      status: async () => true,
      install: async () => true,
      repair: async () => true,
    },

    providers: {
      search: async (_provider, options = {}) => {
        await delay(180);
        const needle = String(options.query || '').toLowerCase();
        const items = MOCK_PROJECTS.filter((item) => (
          item.projectType === (options.projectType || 'mod')
          && (!needle || `${item.title} ${item.description}`.toLowerCase().includes(needle))
        ));
        return { total: items.length, items };
      },
    },

    mods: {
      list: async () => installedContent.map((item) => ({ ...item })),
      install: async (instanceId, request) => {
        await delay(350);
        const project = MOCK_PROJECTS.find((item) => item.projectId === request.projectId) || MOCK_PROJECTS[0];
        const folder = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks' }[project.projectType] || 'mods';
        const entry = {
          key: `modrinth:${project.projectId}`, provider: 'modrinth', projectId: project.projectId,
          versionId: `mock-${project.projectId}-version`, title: project.title, versionNumber: '1.0.0',
          filename: `${project.slug}.jar`, folder, hashes: {}, size: 1_000_000, enabled: true,
          pinned: false, installedAt: Date.now(), updatedAt: Date.now(), dependencies: [],
        };
        installedContent = [...installedContent.filter((item) => item.key !== entry.key), entry];
        emit('content:install', { instanceId, key: entry.key, status: 'completed', entry });
        return entry;
      },
      importLocal: async () => null,
      remove: async (instanceId, key) => {
        installedContent = installedContent.filter((item) => item.key !== key);
        emit('content:removed', { instanceId, key });
        return true;
      },
      setEnabled: async (_instanceId, key, enabled) => {
        let updated;
        installedContent = installedContent.map((item) => {
          if (item.key !== key) return item;
          updated = { ...item, enabled };
          return updated;
        });
        return updated;
      },
      setPinned: async (_instanceId, key, pinned) => {
        let updated;
        installedContent = installedContent.map((item) => {
          if (item.key !== key) return item;
          updated = { ...item, pinned };
          return updated;
        });
        return updated;
      },
      updates: async () => installedContent.map((entry) => ({ entry, available: false, latest: null })),
      updateAll: async () => [],
      verify: async () => installedContent.map((entry) => ({ key: entry.key, valid: true, reason: null })),
    },

    modpacks: {
      installProvider: async (payload) => {
        const created = {
          ...MOCK_INSTANCE, id: `mock-pack-${Date.now()}`, name: payload.name || 'Modpack',
          createdAt: Date.now(), updatedAt: Date.now(), managedPack: {
            provider: payload.provider, projectId: payload.projectId, versionId: 'mock-version',
          },
        };
        instances = [created, ...instances];
        emit('instance:created', created);
        return created;
      },
      installArchive: async () => null,
    },

    backups: {
      create: async (instanceId, options = {}) => {
        const backup = { filename: `${instanceId}-mock-${options.kind || 'full'}.zip`, bytes: 2_000_000, createdAt: Date.now() };
        backups = [backup, ...backups];
        emit('backup:created', { instanceId, ...backup });
        return backup;
      },
      list: async (instanceId) => backups.filter((item) => item.filename.startsWith(instanceId)),
      restore: async () => true,
    },

    files: {
      pickContent: async () => null,
      pickModpack: async () => null,
    },

    game: {
      list: async () => (running ? [running] : []),
      launch: async () => {
        state('preparing', 'Resolving Java runtime');
        await delay(700);
        state('installing', 'Verifying Minecraft and loader files');
        await delay(900);
        state('launching', 'Starting Minecraft');
        await delay(600);
        running = {
          launchId: 'mock-launch', instanceId: MOCK_INSTANCE.id,
          pid: 4242, status: 'running', startedAt: Date.now(),
        };
        state('running', 'Minecraft is running');
        return running;
      },
      stop: async () => {
        state('stopping', 'Stopping Minecraft');
        await delay(500);
        running = null;
        state('stopped', 'Minecraft stopped');
        return true;
      },
    },

    servers: {
      ping: async (address) => {
        await delay(250 + Math.random() * 350);
        const online = MOCK_PLAYERS[address];
        if (online === undefined) return { address, online: false, error: 'timeout' };
        return {
          address,
          resolvedAddress: `${address}:25565`,
          online: true,
          latencyMs: 40,
          description: '',
          players: { online, max: online * 2, sample: [] },
          version: { name: '1.21.11', protocol: 780 },
          favicon: null,
        };
      },
    },

    window: {
      minimize: async () => false,
      maximize: async () => false,
      close: async () => false,
    },

    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    },

    updater: {
      getState: async () => ({
        status: 'disabled', version: null, percent: null, transferred: null,
        total: null, bytesPerSecond: null, message: 'Updates are available in installed builds only',
      }),
      check: async () => null,
      install: async () => false,
    },

    on: (name, listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
      return () => listeners.get(name)?.delete(listener);
    },
  };
}
