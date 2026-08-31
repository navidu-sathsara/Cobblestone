'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loaderFromDependencies } = require('../backend/services/modpack-service');
const { neoforgeMatches } = require('../backend/services/loader-service');
const { parseAddress, flattenDescription } = require('../backend/services/server-service');
const { redact } = require('../backend/services/game-service');
const { createLauncherBackend } = require('../backend');

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
