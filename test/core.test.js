'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LauncherPaths, resolveInside, safeFilename, assertNoSymlinkComponents } = require('../backend/core/paths');
const { EncryptedFileVault } = require('../backend/core/secret-vault');
const { SettingsService } = require('../backend/services/settings-service');
const { EventEmitter } = require('node:events');

async function temporary() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'cobblestone-test-'));
}

test('resolveInside rejects directory traversal', () => {
  assert.equal(resolveInside('/tmp/root', 'mods', 'ok.jar'), path.resolve('/tmp/root/mods/ok.jar'));
  assert.throws(() => resolveInside('/tmp/root', '..', 'escape'));
  assert.throws(() => safeFilename('../bad.jar'));
  assert.equal(safeFilename('good.jar'), 'good.jar');
});

test('managed writes reject symlinked parent directories', async (t) => {
  const directory = await temporary();
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const outside = await temporary();
  t.after(() => fsp.rm(outside, { recursive: true, force: true }));
  await fsp.symlink(outside, path.join(directory, 'mods'));
  assert.throws(
    () => assertNoSymlinkComponents(directory, path.join(directory, 'mods', 'unsafe.jar')),
    /symbolic links/i,
  );
});

test('encrypted vault does not persist secret plaintext', async (t) => {
  const directory = await temporary();
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const vault = new EncryptedFileVault(directory);
  await vault.set('token', 'extremely-secret-refresh-token');
  assert.equal(await vault.get('token'), 'extremely-secret-refresh-token');
  const raw = fs.readFileSync(path.join(directory, 'vault.enc.json'), 'utf8');
  assert.equal(raw.includes('extremely-secret-refresh-token'), false);
  await vault.delete('token');
  assert.equal(await vault.get('token'), null);
});

test('settings contain backend options and no theme or appearance state', async (t) => {
  const directory = await temporary();
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const paths = new LauncherPaths(directory).ensure();
  const settings = new SettingsService(paths, new EventEmitter());
  const initial = settings.get();
  assert.equal('appearance' in initial, false);
  assert.equal('theme' in initial, false);
  const next = await settings.set({ downloads: { concurrency: 9 } });
  assert.equal(next.downloads.concurrency, 9);
  assert.equal(next.memory.minimumMb, initial.memory.minimumMb);
});
