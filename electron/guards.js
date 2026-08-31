'use strict';

/**
 * Pure security guards for the Electron host, kept free of any `electron`
 * import so they can be unit tested in plain Node (see test/desktop.test.js).
 */

const path = require('node:path');

/**
 * Builds an exact-origin IPC sender validator. Prefix matching is avoided
 * deliberately: `app://launcher.evil.example` starts with `app://launcher`.
 */
function createSenderValidator({ scheme, host, devServerOrigin = null }) {
  const devOrigin = devServerOrigin ? new URL(devServerOrigin).origin : null;
  return (frame) => {
    if (!frame) return false;
    let url;
    try {
      url = new URL(frame.url);
    } catch {
      return false;
    }
    if (devOrigin) return url.origin === devOrigin;
    return url.protocol === `${scheme}:` && url.host === host;
  };
}

/** True only for https URLs on an allowlisted host or one of its subdomains. */
function isAllowedExternalUrl(value, hosts) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

/**
 * Maps a custom-protocol request onto a file inside the renderer root. Anything
 * that resolves outside the root, or targets the root itself, is refused rather
 * than normalised.
 */
function resolveRendererFile(root, requestUrl, expectedHost) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return { ok: false, status: 400 };
  }
  if (url.host !== expectedHost) return { ok: false, status: 404 };

  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return { ok: false, status: 400 };
  }
  if (decoded.includes('\0')) return { ok: false, status: 400 };

  const requested = decoded.replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(root, requested);
  const relative = path.relative(path.resolve(root), target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, file: target };
}

module.exports = { createSenderValidator, isAllowedExternalUrl, resolveRendererFile };
