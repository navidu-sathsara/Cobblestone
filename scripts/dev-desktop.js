'use strict';

/**
 * Dev runner: starts the Vite dev server, waits for it to accept connections,
 * then launches the Electron host pointed at it. Both binaries are resolved
 * from the workspace, so no globally installed pnpm/vite is required.
 */

const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const HOST = '127.0.0.1';
const PORT = Number(process.env.COBBLESTONE_DEV_PORT || 5173);
const DEV_SERVER_URL = `http://localhost:${PORT}`;

const children = new Set();

function shutdown(code) {
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}

function waitForPort(timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const probe = () => {
      const socket = net.connect({ host: HOST, port: PORT });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`Vite did not open ${DEV_SERVER_URL} in time`));
        else setTimeout(probe, 250);
      });
    };
    probe();
  });
}

async function main() {
  const vitePackage = require.resolve('vite/package.json', { paths: [FRONTEND] });
  const viteBin = path.join(path.dirname(vitePackage), 'bin', 'vite.js');
  const vite = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], {
    cwd: FRONTEND,
    stdio: 'inherit',
  });
  children.add(vite);
  vite.once('exit', (code) => {
    children.delete(vite);
    if (code) shutdown(code);
  });

  await waitForPort();

  const electronBin = require('electron');
  const electronArgs = [path.join(ROOT, 'electron', 'main.js')];
  if (process.platform === 'linux' || process.env.ELECTRON_NO_SANDBOX === '1') {
    electronArgs.unshift('--no-sandbox');
  }
  const electron = spawn(electronBin, electronArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: DEV_SERVER_URL },
  });
  children.add(electron);
  electron.once('exit', (code) => {
    children.delete(electron);
    shutdown(code || 0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown(0));

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  shutdown(1);
});
