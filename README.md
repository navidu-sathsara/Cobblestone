# Cobblestone Launcher

<p align="center">
  <img alt="Cobblestone Logo" width="128" src="./xmcl-electron-app/icons/dark@256x256.png">
</p>

<p align="center">
  <strong>A modern, high-performance, open-source Minecraft launcher.</strong>
  <br>
  <em>A dedicated fork of X-Minecraft-Launcher (XMCL), engineered for rock-solid stability and modularity.</em>
</p>

<p align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
  </a>
  <a href="https://conventionalcommits.org">
    <img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg" alt="Commit">
  </a>
  <a href="#features">
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg" alt="Cross-Platform">
  </a>
</p>

---

## 🧱 About Cobblestone Launcher

**Cobblestone Launcher** is a powerful, cross-platform Minecraft launcher built on Electron, Vue 3, and TypeScript. Forked from the robust foundation of [X-Minecraft-Launcher (XMCL)](https://github.com/voxelum/x-minecraft-launcher), Cobblestone brings forward refined launcher architecture, optimized disk space management through hard links and symbol links, built-in P2P multiplayer tunneling, and comprehensive mod/modpack integration.

### 🌟 Key Features

- 📥 **Fast Multi-Threaded Downloads**: Smart concurrent chunk downloader with mirror fallback for `Minecraft`, `Forge`, `Fabric`, `Quilt`, `NeoForge`, `OptiFine`, and runtime `JVM` distributions.
- 🗂 **Smart Resource Storage**: Instances share mods, resource packs, and shaders via filesystem links without duplicating disk space.
- 📚 **Robust Multi-Instancing**: Isolated instance configs, separate Java environments, per-profile mod staging, and automated version resolution.
- 🔥 **CurseForge & Modrinth Integration**: Direct in-app browsing, installation, one-click updating, and mod dependency resolution.
- 📦 **Modpack Import & Export**: Full standard compliance with CurseForge, Modrinth, and custom modpack formats.
- 🔒 **Comprehensive Account Systems**: Official Microsoft OAuth login, Mojang Yggdrasil API, and third-party auth provider support (Ely.by, LittleSkin, custom Yggdrasil endpoints).
- 🔗 **P2P Multiplayer / LAN Tunneling**: Integrated peer-to-peer WebRTC / STUN connection to play LAN worlds across the internet without port forwarding.
- 💻 **Cross-Platform & Modern UI**: Sleek dark/light theme UI powered by Vuetify and UnoCSS, with native integration for Windows 10/11, macOS, Linux, and Steam Deck.

---

## 🛠️ Development & Building

### Prerequisites

- **Node.js**: `>= 22.16.0`
- **pnpm**: `>= 10.0.0` (or run with `corepack pnpm`)

### Setup

```bash
# Clone the repository
git clone https://github.com/voxelum/x-minecraft-launcher.git cobblestone
cd cobblestone

# Install dependencies
corepack pnpm install
```

### Running Locally

```bash
# Terminal 1: Run Vite UI Dev Server
corepack pnpm dev:renderer

# Terminal 2: Run Electron Main Process
corepack pnpm dev:main
```

### Building Distribution Packages

```bash
# Compile packages
corepack pnpm compile

# Build UI renderer
corepack pnpm build:renderer

# Build full Electron application
corepack pnpm build
```

---

## 📦 Architecture & Core Packages

Cobblestone Launcher is organized as a pnpm monorepo containing modular, reusable Minecraft libraries:

| Package | Description | Directory |
| --- | --- | --- |
| `@xmcl/core` | Core Minecraft launching and process execution | [`packages/core`](packages/core) |
| `@xmcl/installer` | Version, loader, and asset installer | [`packages/installer`](packages/installer) |
| `@xmcl/user` | Authentication, OAuth, and skin management | [`packages/user`](packages/user) |
| `@xmcl/mod-parser` | Forge, Fabric, Quilt, and LiteLoader mod parser | [`packages/mod-parser`](packages/mod-parser) |
| `@xmcl/curseforge` | CurseForge REST API client | [`packages/curseforge`](packages/curseforge) |
| `@xmcl/modrinth` | Modrinth REST API client | [`packages/modrinth`](packages/modrinth) |
| `@xmcl/nbt` | High-performance NBT binary parser/serializer | [`packages/nbt`](packages/nbt) |
| `@xmcl/game-data` | Level.dat, servers.dat, and world info reader | [`packages/game-data`](packages/game-data) |
| `@xmcl/file-transfer` | Resilient concurrent download engine | [`packages/file-transfer`](packages/file-transfer) |
| `@xmcl/wrtc-multiplayer` | WebRTC peer-to-peer multiplayer layer | [`packages/wrtc-multiplayer`](packages/wrtc-multiplayer) |

---

## 📜 Lineage & License

Cobblestone Launcher is licensed under the [MIT License](LICENSE).

### Acknowledgments

Cobblestone Launcher is forked from [X-Minecraft-Launcher (XMCL)](https://github.com/voxelum/x-minecraft-launcher), created by [CI010](https://github.com/ci010) and developed with the generous contributions of the open-source Minecraft community.

Special thanks to all upstream contributors, translators, and maintainers who established the foundations of this launcher.
