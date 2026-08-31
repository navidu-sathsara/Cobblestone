import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The CSP is owned by the Electron host so the header and the embedded meta tag
// cannot diverge; the config runs in Node, so a plain require is enough.
const require = createRequire(import.meta.url);
const { buildCsp } = require('../electron/csp.js');

/** Embeds the production CSP in the built HTML so the policy ships with the bundle. */
function cspMeta() {
  return {
    name: 'cobblestone-csp-meta',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp() },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  // Relative asset URLs keep the bundle working under the app://launcher origin.
  base: './',
  plugins: [react(), cspMeta()],
  // `allowedHosts` lets the renderer be previewed through a proxied hostname
  // while the desktop shell keeps loading it from localhost.
  server: { port: 5173, strictPort: true, allowedHosts: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
