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

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export function createMockBridge() {
  const listeners = new Map();
  const accounts = [MOCK_ACCOUNT];
  let activeId = MOCK_ACCOUNT.id;
  let running = null;

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
      version: '4.0.7',
      dataDirectory: '~/.cobblestone',
      runningGames: running ? [running] : [],
      downloads: [],
      instances: MOCK_INSTANCES.length,
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

    instances: {
      list: async () => [...MOCK_INSTANCES],
      create: async () => MOCK_INSTANCE,
    },

    installation: {
      status: async () => true,
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
