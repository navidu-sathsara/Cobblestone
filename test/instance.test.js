'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { LauncherPaths } = require('../backend/core/paths');
const { InstanceService } = require('../backend/services/instance-service');

test('instances support create, update, duplicate, trash, and restore', async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'cobblestone-instance-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const paths = new LauncherPaths(directory).ensure();
  const service = new InstanceService(paths, new EventEmitter());
  const created = await service.create({ name: 'Test', minecraftVersion: '1.21.1', loader: 'Fabric' });
  assert.equal(created.loader, 'fabric');
  assert.equal(fs.existsSync(path.join(paths.instance(created.id), 'mods')), true);
  const updated = await service.update(created.id, { loaderVersion: '0.16.14' });
  assert.equal(updated.loaderVersion, '0.16.14');
  await fsp.mkdir(path.join(paths.instance(created.id), 'saves', 'My World'), { recursive: true });
  const deletedWorld = await service.deleteWorld(created.id, 'My World');
  assert.equal(service.deletedWorlds(created.id)[0].worldName, 'My World');
  await service.restoreWorld(created.id, deletedWorld.trashName);
  assert.equal(fs.existsSync(path.join(paths.instance(created.id), 'saves', 'My World')), true);
  await fsp.writeFile(path.join(paths.instance(created.id), 'options.txt'), 'fov:0.5');
  const duplicate = await service.duplicate(created.id, 'Copy');
  assert.equal(await fsp.readFile(path.join(paths.instance(duplicate.id), 'options.txt'), 'utf8'), 'fov:0.5');
  await service.delete(created.id);
  assert.equal(service.list().some((item) => item.id === created.id), false);
  assert.equal(service.deleted()[0].instance.id, created.id);
  await service.restore(created.id);
  assert.equal(service.get(created.id).name, 'Test');
  assert.equal(service.deleted().length, 0);
});

test('instance operation locks reject overlapping mutations', async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'cobblestone-lock-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const service = new InstanceService(new LauncherPaths(directory).ensure(), new EventEmitter());
  const instance = await service.create({ name: 'Busy', minecraftVersion: '1.20.1' });
  const release = service.acquireLock(instance.id, 'test');
  assert.equal(service.busy(instance.id), 'test');
  assert.throws(() => service.acquireLock(instance.id, 'second'), /already busy/i);
  release();
  assert.equal(service.busy(instance.id), null);
});
