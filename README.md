# Cobblestone Launcher

Cobblestone is a Minecraft Java launcher built as two strictly separated parts:

- `backend/` — the launcher core. No renderer, HTML, CSS, theme system, product
  telemetry, proprietary account service, or cloud dependency. It is publishable
  and embeddable on its own.
- `electron/` + `frontend/` — a desktop shell and React renderer that host the
  core behind a sandboxed, context-isolated window with a strict Content
  Security Policy.

For architecture, every service API, state schemas, events, Electron channels,
security boundaries, recovery behavior, workflows, testing, and extension
points, read the [advanced backend guide](docs/ADVANCED_BACKEND_GUIDE.md).

## Capabilities

- Microsoft multi-account login through the system browser, token refresh, and
  encrypted-at-rest refresh data
- Offline profiles, isolated instances, recoverable deletion, duplication,
  per-instance Java/memory/resolution/JVM overrides, play-time tracking, and
  operation locks
- Minecraft release/snapshot metadata with offline cache
- Automatic Java 8, 17, 21, and 25 detection and managed Adoptium runtimes
- Vanilla, Fabric, Quilt, Forge, and NeoForge loader resolution
- Prioritized, concurrent, resumable, mirrored downloads with cancellation,
  retries, atomic replacement, expected-size checks, and cryptographic hashes
- Modrinth and CurseForge search, compatible-version selection, required
  dependencies, enable/disable, pinning, integrity checks, update checks, bulk
  updates, safe local-file imports, and recoverable removals
- Recoverable Modrinth `.mrpack` and CurseForge pack installation with zip
  traversal protection and failed-instance diagnostics
- World/content/full instance backups, restore, and retention
- Concurrent game sessions across different instances, redacted logs, state
  events, graceful termination, quick-play arguments, and crash exit reporting
- Native Minecraft server-list ping, diagnostics, storage accounting, and stale
  partial-download cleanup
- Optional narrow Electron IPC adapter with sender validation and structured
  errors; no unrestricted `ipcRenderer` bridge is included

## Desktop app

```bash
pnpm install
pnpm desktop:dev     # Vite dev server + Electron, hot reload
pnpm desktop         # production renderer build, then Electron
```

`electron/main.js` is the reference host and implements every item under "Host
responsibilities" in the backend guide: the renderer is sandboxed with context
isolation and no Node integration, it is served from an exact-match
`app://launcher` origin (or the dev server), navigation and popups are denied,
permission requests are refused, and IPC senders are validated per call. The
Content Security Policy lives in `electron/csp.js` and is applied twice from
that single source — as a response header by the main process and as a `<meta>`
tag baked into the production bundle.

`frontend/` is a React renderer whose home page reads live launcher state:
accounts, instances (hero launch target plus a shelf of every instance),
launch/stop with progress, and native server-list pings for partnered-server
player counts. It talks only to the narrow bridge installed by
`electron/preload.js`; opened in a plain browser (`pnpm frontend:dev`) it falls
back to a mock so the UI can be developed without the shell.

Player renders and server icons are fetched from `mc-heads.net` and
`api.mcsrvstat.us`. Those are the only remote image origins on the CSP
allowlist; add any others to `REMOTE_IMAGE_ORIGINS` in `electron/csp.js`.

Application packaging (electron-builder, installers, signing, auto-update) is
not configured yet.

## Embedding the core in another host

The core does not create a window, preload, or navigation policy, so a
third-party host can wire it up itself:

```js
const { app, ipcMain } = require('electron');
const { createLauncherBackend } = require('cobblestone-launcher-core');
const { registerElectronIpc } = require('cobblestone-launcher-core/backend/adapters/electron-ipc');

app.whenReady().then(() => {
  const backend = createLauncherBackend({
    dataDir: app.getPath('userData'),
    version: app.getVersion(),
  });

  registerElectronIpc({
    ipcMain,
    backend,
    // Exact origin match: a prefix check would accept app://launcher.evil.example
    validateSender: (frame) => {
      if (!frame) return false;
      const url = new URL(frame.url);
      return url.protocol === 'app:' && url.host === 'launcher';
    },
    eventSink: (name, payload) => sendToYourTrustedWindow(name, payload),
  });
});
```

The host must use a sandboxed renderer, context isolation, a restrictive
Content Security Policy, an allowlisted navigation policy, and a preload that
exposes individual operations rather than raw IPC. See `electron/main.js` and
`electron/preload.js` for a complete implementation.

## Direct API

```js
const { createLauncherBackend } = require('./backend');

const launcher = createLauncherBackend({ dataDir: '/path/to/app-data' });
const instance = await launcher.instances.create({
  name: 'Fabric survival',
  minecraftVersion: '1.21.1',
  loader: 'fabric',
});

const search = await launcher.providers.search('modrinth', {
  query: 'Fabric API',
  minecraftVersion: instance.minecraftVersion,
  loader: instance.loader,
});

await launcher.mods.install(instance.id, {
  provider: 'modrinth',
  projectId: search.items[0].projectId,
});
```

All long-running operations publish events through `launcher.events`.
Important event names are `download:progress`, `auth:progress`,
`instance:operation`, `content:install`, `modpack:progress`, `java:install`,
`game:state`, and `game:log`.

## CurseForge

CurseForge requires an approved third-party API key. Cobblestone does not ship
one in source or package metadata:

```js
await launcher.providers.get('curseforge').setApiKey(apiKey);
```

The key is kept in the encrypted local vault. Files for which authors disable
third-party distribution return a structured configuration error instead of
attempting to bypass the restriction.

## Commands

```bash
pnpm install
pnpm check
pnpm test
pnpm doctor
pnpm desktop:dev
node backend/cli.js doctor --offline
node backend/cli.js versions 10
node backend/cli.js search modrinth sodium
```

`doctor --offline` performs only local checks. The normal doctor also verifies
Minecraft metadata and Modrinth availability.

## Local data layout

```text
~/.cobblestone/
├── minecraft/
│   ├── assets/
│   ├── libraries/
│   ├── versions/
│   └── instances/<id>/
├── java/
├── backups/
├── cache/
├── downloads/
├── logs/
├── metadata/
├── state/
│   ├── accounts.json
│   ├── instances.json
│   ├── settings.json
│   ├── vault.key
│   └── vault.enc.json
└── trash/
```

The vault key and ciphertext are permission-restricted where the operating
system supports POSIX modes. A desktop host may inject its own OS-keychain
vault implementation through `createLauncherBackend({ vault })`.
