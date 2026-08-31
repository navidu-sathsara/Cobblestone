# Cobblestone Launcher — working notes

## Original request (this session)
Clean /app, unzip attached ZIP, read the code, then work. No ZIP was attached; user
said "download the github and read". /app already contained the repo
(github.com/navidu-sathsara/Cobblestone, main @ 17221d7, clean tree, in sync with origin),
so nothing was deleted. Follow-up request: "remake fully home page".
Hard constraints from the user: never run/start/build the app (no npm/pnpm run, start or build).

## Architecture (as read)
- backend/ — CommonJS launcher core (Node >=22): accounts (msmc + offline, AES-256-GCM vault),
  versions, java (8/17/21/25, Adoptium), loaders (vanilla/fabric/quilt/forge/neoforge),
  installation, instances (locks, trash), download-manager (resumable/mirrored/hashed),
  providers (modrinth, curseforge), mods, modpacks (.mrpack/CF), backups, game supervisor,
  servers ping, diagnostics, cli.js. Contract: docs/ADVANCED_BACKEND_GUIDE.md.
- electron/ — hardened host: app://launcher protocol, sandbox + contextIsolation, CSP in csp.js
  (img-src: mc-heads.net, api.mcsrvstat.us; font-src 'self' → no remote webfonts),
  guards.js, narrow preload bridge.
- frontend/ — React 19 + Vite renderer, home page only; mock-bridge.js for plain-browser dev.
- test/ — 5 Node test-runner files. Packaging (electron-builder/auto-update) not configured.

## Done
- 2026-08-31: v4.0.5 account/home interaction update:
  - Replaced the cramped titlebar account menu with a compact account trigger and a
    full sign-in/profile modal with saved profiles, Microsoft progress, inline errors,
    and offline-profile creation.
  - Fixed Microsoft OAuth hanging by keeping msmc raw-browser output enabled; msmc
    uses that output to discover Chromium's debugging port and observe the callback.
  - Partnered servers now lead the right rail; Community and Store are anchored at
    the bottom. Offline servers cannot trigger a launch.
  - Hero launch now routes missing-account launches to the sign-in modal, guards
    repeated instance creation, and immediately selects newly created instances.
  - Verified with direct renderer AST parsing, JavaScript syntax checks, and 21 Node
    tests. The app was not run or built.
- 2026-06: Full home-page remake (renderer only, no backend/electron/IPC changes):
  - New token system in styles/theme.css: deepslate greys + copper primary, amethyst/lime
    secondaries, condensed display font stack (Bahnschrift/DIN family) + system UI text stack,
    system-resident only because the CSP forbids remote fonts. Grain overlay, rise animation.
  - TitleBar: stone-block mark, wordmark + tagline, live session chip (playing/preparing),
    account pill with type + count, account menu with inline offline-username field
    (replaces window.prompt), window controls.
  - SideRail: wider labelled rail, copper active marker, Settings pinned to the foot, version.
  - HeroPanel: asymmetric layout — greeting/instance title/metadata chips/split LAUNCH control
    with instance picker + status line + indeterminate progress on the left, player body render
    with nametag and ground shadow on the right; CSS-painted cavern backdrop.
  - InstanceShelf (new): horizontal cards for every backend instance, install-state dot,
    build, play time, plus a "New instance" card.
  - NewsSection: three artwork cards (copper/amethyst/verdant) with hover reveal.
  - FriendsPanel / RightRail: restyled, online count, per-server accent stripe, hover
    join affordance, compact player counts.
  - lib/format.js: added formatCompact, formatBuild, formatInstallState, formatPlaytime,
    formatRelative, greeting.
  - mock-bridge.js: three mock instances so the browser preview exercises the shelf.
  - data-testid on every interactive/critical element.
- Verified by esbuild parse of every renderer .jsx/.js/.css (no run/build of the app,
  per the user's constraint). NOT verified in a browser or in Electron.

## Backlog
- P0: visual/functional verification in the desktop shell (user runs it).
- P1: Profiles/instance manager, Content (Modrinth/CurseForge) browser, Settings pages —
  the rail links currently show a "not part of the home page yet" notice.
- P2: real news feed source, real friends/social source, electron-builder packaging.
