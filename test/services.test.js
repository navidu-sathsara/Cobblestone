'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { loaderFromDependencies } = require('../backend/services/modpack-service');
const { neoforgeMatches } = require('../backend/services/loader-service');
const { parseAddress, flattenDescription } = require('../backend/services/server-service');
const { redact } = require('../backend/services/game-service');
const { createLauncherBackend } = require('../backend');
const { LauncherPaths } = require('../backend/core/paths');
const { AccountService } = require('../backend/services/account-service');
const { InstanceService } = require('../backend/services/instance-service');
const { ModService } = require('../backend/services/mod-service');
const { ProviderRegistry } = require('../backend/providers/provider-registry');

test('loader metadata normalizes all supported pack loaders', () => {
  assert.deepEqual(loaderFromDependencies({ minecraft: '1.21.1', 'fabric-loader': '0.16.0' }), {
    loader: 'fabric', loaderVersion: '0.16.0',
  });
  assert.equal(loaderFromDependencies({ neoforge: '21.1.5' }).loader, 'neoforge');
  assert.equal(loaderFromDependencies({ 'quilt-loader': '0.27.0' }).loader, 'quilt');
  assert.equal(neoforgeMatches('1.21.1', '21.1.80'), true);
  assert.equal(neoforgeMatches('1.21.4', '21.1.80'), false);
});

test('server addresses and chat descriptions are normalized', () => {
  assert.deepEqual(parseAddress('example.org:25566'), { host: 'example.org', port: 25566 });
  assert.deepEqual(parseAddress('[::1]:25565'), { host: '::1', port: 25565 });
  assert.equal(parseAddress('bad address'), null);
  assert.equal(flattenDescription({ text: 'Hello', extra: [{ text: ' world' }] }), 'Hello world');
});

test('game logs redact access credentials', () => {
  assert.equal(redact('java --accessToken secret-value --uuid abc').includes('secret-value'), false);
  assert.equal(redact('{"accessToken":"secret-value"}').includes('secret-value'), false);
});

test('Microsoft login keeps msmc browser output enabled for OAuth callback discovery', async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'cobblestone-auth-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  let launchOptions;
  const vault = {
    values: new Map(),
    async get(key) { return this.values.get(key) ?? null; },
    async set(key, value) { this.values.set(key, value); },
    async delete(key) { this.values.delete(key); },
  };
  const service = new AccountService(
    new LauncherPaths(directory).ensure(),
    new EventEmitter(),
    vault,
    {
      authFactory: () => ({
        on() {},
        async launch(framework, options) {
          assert.equal(framework, 'raw');
          launchOptions = options;
          return {
            save: () => 'refresh-token',
            getMinecraft: async () => ({ profile: { id: 'profile-id', name: 'Player' } }),
          };
        },
      }),
    },
  );

  const account = await service.loginMicrosoft();
  assert.equal(account.username, 'Player');
  assert.equal(launchOptions.suppress, undefined);
  assert.equal(await vault.get('microsoft:profile-id'), 'refresh-token');
});

test('composed backend starts with no renderer or theme state', async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'cobblestone-backend-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const backend = createLauncherBackend({ dataDir: directory });
  const status = backend.status();
  assert.equal(status.name, 'Cobblestone');
  assert.deepEqual(status.providers.sort(), ['curseforge', 'modrinth']);
  assert.equal('theme' in backend.settings.get(), false);
  const doctor = await backend.diagnostics.doctor({ network: false });
  assert.equal(doctor.ok, true);
});

test('local content can be imported, verified, toggled, and removed safely', async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'cobblestone-content-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const backend = createLauncherBackend({ dataDir: path.join(directory, 'data') });
  const instance = await backend.instances.create({ name: 'Mods', minecraftVersion: '1.21.1', loader: 'fabric' });
  const source = path.join(directory, 'example.jar');
  await fsp.writeFile(source, 'test mod bytes');
  const installed = await backend.mods.importLocal(instance.id, source);
  assert.equal(installed.provider, 'local');
  assert.equal((await backend.mods.verify(instance.id))[0].valid, true);
  await fsp.writeFile(path.join(backend.paths.instance(instance.id), 'options.txt'), 'fov:0.5');
  const backup = await backend.backups.create(instance.id, { kind: 'full', reason: 'test' });
  await fsp.writeFile(path.join(backend.paths.instance(instance.id), 'options.txt'), 'fov:1.0');
  await backend.backups.restore(backup.filename);
  assert.equal(await fsp.readFile(path.join(backend.paths.instance(instance.id), 'options.txt'), 'utf8'), 'fov:0.5');
  const disabled = await backend.mods.setEnabled(instance.id, installed.key, false);
  assert.equal(disabled.filename.endsWith('.disabled'), true);
  await backend.mods.setEnabled(instance.id, installed.key, true);
  await backend.mods.remove(instance.id, installed.key);
  assert.equal(backend.mods.list(instance.id).length, 0);
});

test('non-mod content compatibility does not filter releases by mod loader', async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'cobblestone-resourcepack-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const paths = new LauncherPaths(directory).ensure();
  const events = new EventEmitter();
  const instances = new InstanceService(paths, events);
  const instance = await instances.create({ name: 'Fabric', minecraftVersion: '1.21.1', loader: 'fabric' });
  const requestedLoaders = [];
  const provider = {
    id: 'test',
    project: async () => ({ provider: 'test', projectId: 'pack', title: 'Pack', projectType: 'resourcepack' }),
    versions: async (_id, options) => {
      requestedLoaders.push(options.loader);
      return [{
        provider: 'test', projectId: 'pack', versionId: 'v1', versionNumber: '1.0.0',
        dependencies: [], files: [],
      }];
    },
    selectFile: async () => ({ filename: 'pack.zip', url: 'https://example.test/pack.zip', hashes: {}, size: 4 }),
  };
  const settings = { get: () => ({
    mods: {
      preferredProvider: 'test', releaseChannels: ['release'], installRequiredDependencies: false,
      updatePinned: false,
    },
    instances: { autoBackupBeforeUpdates: false },
  }) };
  const downloads = {
    download: async ({ destination }) => {
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.writeFile(destination, 'pack');
    },
  };
  const mods = new ModService(
    paths, settings, instances, new ProviderRegistry([provider]), downloads, events,
  );

  const installed = await mods.install(instance.id, { provider: 'test', projectId: 'pack' });
  assert.equal(installed.folder, 'resourcepacks');
  await mods.checkUpdates(instance.id);
  assert.deepEqual(requestedLoaders, [undefined, undefined]);
});
