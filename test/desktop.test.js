'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildCsp, REMOTE_IMAGE_ORIGINS, EXTERNAL_LINK_HOSTS } = require('../electron/csp');
const { createSenderValidator, isAllowedExternalUrl, resolveRendererFile } = require('../electron/guards');

const RENDERER_ROOT = path.join(__dirname, '..', 'frontend', 'dist');

test('production CSP denies by default and only allows the declared image origins', () => {
  const csp = buildCsp();
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  for (const origin of REMOTE_IMAGE_ORIGINS) assert.ok(csp.includes(origin));
  assert.doesNotMatch(csp, /connect-src [^;]*https:/);
});

test('dev CSP relaxes only for the dev server origin', () => {
  const csp = buildCsp({ devServerOrigin: 'http://localhost:5173' });
  assert.match(csp, /script-src [^;]*'unsafe-eval'/);
  assert.match(csp, /connect-src [^;]*ws:\/\/localhost:5173/);
  assert.ok(csp.includes('http://localhost:5173'));
});

test('IPC sender validation matches the app origin exactly', () => {
  const validate = createSenderValidator({ scheme: 'app', host: 'launcher' });
  assert.equal(validate({ url: 'app://launcher/index.html' }), true);
  assert.equal(validate({ url: 'app://launcher/assets/index.js' }), true);
  // Lookalike hosts a startsWith() check would have accepted.
  assert.equal(validate({ url: 'app://launcher.evil.example/index.html' }), false);
  assert.equal(validate({ url: 'app://otherhost/index.html' }), false);
  assert.equal(validate({ url: 'https://launcher/index.html' }), false);
  assert.equal(validate({ url: 'file:///etc/passwd' }), false);
  assert.equal(validate({ url: 'not a url' }), false);
  assert.equal(validate(null), false);
});

test('dev sender validation accepts only the dev server origin', () => {
  const validate = createSenderValidator({
    scheme: 'app', host: 'launcher', devServerOrigin: 'http://localhost:5173',
  });
  assert.equal(validate({ url: 'http://localhost:5173/' }), true);
  assert.equal(validate({ url: 'http://localhost:5174/' }), false);
  assert.equal(validate({ url: 'http://evil.example/' }), false);
  assert.equal(validate({ url: 'app://launcher/index.html' }), false);
});

test('external links are limited to https on allowlisted hosts', () => {
  const allowed = (url) => isAllowedExternalUrl(url, EXTERNAL_LINK_HOSTS);
  assert.equal(allowed('https://discord.gg/cobblestone'), true);
  assert.equal(allowed('https://cobblestone.net/store'), true);
  assert.equal(allowed('https://cdn.cobblestone.net/x.png'), true);
  assert.equal(allowed('http://cobblestone.net/store'), false);
  assert.equal(allowed('https://cobblestone.net.evil.example/'), false);
  assert.equal(allowed('https://evil.example/'), false);
  assert.equal(allowed('file:///etc/passwd'), false);
  assert.equal(allowed('javascript:alert(1)'), false);
  assert.equal(allowed(undefined), false);
});

test('renderer protocol refuses traversal, foreign hosts, and the root itself', () => {
  const root = '/srv/renderer';
  assert.deepEqual(
    resolveRendererFile(root, 'app://launcher/assets/app.js', 'launcher'),
    { ok: true, file: path.resolve(root, 'assets/app.js') },
  );
  // An empty path serves the entry document.
  assert.deepEqual(
    resolveRendererFile(root, 'app://launcher/', 'launcher'),
    { ok: true, file: path.resolve(root, 'index.html') },
  );
  // The URL parser already collapses literal "../" segments, so the request
  // lands inside the root; the containment check is what stops the encoded form.
  const literal = resolveRendererFile(root, 'app://launcher/../../etc/passwd', 'launcher');
  assert.equal(literal.ok, true);
  assert.equal(literal.file, path.resolve(root, 'etc/passwd'));
  assert.equal(resolveRendererFile(root, 'app://launcher/%2e%2e%2f%2e%2e%2fetc/passwd', 'launcher').status, 403);
  assert.equal(resolveRendererFile(root, 'app://launcher/..%2f..%2fetc/passwd', 'launcher').status, 403);
  assert.equal(resolveRendererFile(root, 'app://elsewhere/index.html', 'launcher').status, 404);
  assert.equal(resolveRendererFile(root, 'app://launcher/a%00b', 'launcher').status, 400);
});

test('the built renderer embeds exactly the production CSP', (t) => {
  const html = path.join(RENDERER_ROOT, 'index.html');
  if (!fs.existsSync(html)) {
    t.skip('run `pnpm frontend:build` first');
    return;
  }
  const source = fs.readFileSync(html, 'utf8');
  const match = source.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(match, 'built index.html must carry a CSP meta tag');
  assert.equal(match[1].replaceAll('&quot;', '"').replaceAll('&#39;', "'"), buildCsp());
});
