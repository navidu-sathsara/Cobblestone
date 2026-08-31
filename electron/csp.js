'use strict';

/**
 * Single source of truth for the renderer Content Security Policy.
 *
 * The Electron main process sends this as a response header and the production
 * Vite build embeds the same string as a <meta http-equiv> tag, so the two can
 * never drift apart and silently weaken the shipped policy.
 */

/**
 * Remote image origins the home page is allowed to load. Player body/head
 * renders come from mc-heads.net; partnered-server icons fall back to
 * api.mcsrvstat.us when a server's status ping returns no favicon.
 */
const REMOTE_IMAGE_ORIGINS = [
  'https://mc-heads.net',
  'https://api.mcsrvstat.us',
  'https://cdn.modrinth.com',
];

/** External sites the renderer may ask the main process to open in the browser. */
const EXTERNAL_LINK_HOSTS = ['discord.gg', 'discord.com', 'cobblestone.net', 'modrinth.com'];

function buildCsp({ devServerOrigin = null } = {}) {
  const directives = {
    'default-src': ["'none'"],
    'script-src': ["'self'"],
    // Inline style *attributes* carry the hero backdrop override and the
    // partnered-server accent colors. No inline <script> is ever permitted.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', ...REMOTE_IMAGE_ORIGINS],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'worker-src': ["'none'"],
    'media-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-ancestors': ["'none'"],
  };

  if (devServerOrigin) {
    // Vite's dev client evaluates injected module code and opens an HMR socket.
    // This branch is only reachable when VITE_DEV_SERVER_URL is set.
    const socketOrigin = devServerOrigin.replace(/^http/, 'ws');
    directives['script-src'].push("'unsafe-inline'", "'unsafe-eval'", devServerOrigin);
    directives['connect-src'].push(devServerOrigin, socketOrigin);
    directives['img-src'].push(devServerOrigin);
    directives['style-src'].push(devServerOrigin);
    directives['font-src'].push(devServerOrigin, 'data:');
  }

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

module.exports = { buildCsp, REMOTE_IMAGE_ORIGINS, EXTERNAL_LINK_HOSTS };
