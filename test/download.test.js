'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { HttpClient } = require('../backend/core/http-client');
const { DownloadManager } = require('../backend/core/download-manager');

test('download manager resumes partial files and verifies hashes', async (t) => {
  const content = Buffer.from('a resilient resumable download');
  let sawRange = false;
  const server = http.createServer((request, response) => {
    const match = request.headers.range?.match(/bytes=(\d+)-/);
    const offset = match ? Number(match[1]) : 0;
    sawRange ||= offset > 0;
    response.writeHead(offset ? 206 : 200, {
      'content-length': content.length - offset,
      ...(offset ? { 'content-range': `bytes ${offset}-${content.length - 1}/${content.length}` } : {}),
    });
    response.end(content.subarray(offset));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'cobblestone-download-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const destination = path.join(directory, 'file.bin');
  await fsp.writeFile(`${destination}.part`, content.subarray(0, 7));
  const manager = new DownloadManager({ http: new HttpClient({ allowHttp: true }), concurrency: 2 });
  const result = await manager.download({
    url: `http://127.0.0.1:${server.address().port}/file`, destination, size: content.length,
    hashes: { sha256: crypto.createHash('sha256').update(content).digest('hex') },
  });
  assert.equal(sawRange, true);
  assert.equal(result.bytes, content.length);
  assert.deepEqual(await fsp.readFile(destination), content);
  assert.equal(manager.list()[0].status, 'completed');
});

test('download manager rejects checksum mismatches', async (t) => {
  const server = http.createServer((_request, response) => response.end('wrong'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'cobblestone-integrity-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const manager = new DownloadManager({ http: new HttpClient({ allowHttp: true }), retries: 0 });
  await assert.rejects(manager.download({
    url: `http://127.0.0.1:${server.address().port}/file`,
    destination: path.join(directory, 'file'), hashes: { sha256: '0'.repeat(64) },
  }), /checksum mismatch/i);
});
