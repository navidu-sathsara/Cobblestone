'use strict';

const { EventEmitter } = require('node:events');
const packageJson = require('../package.json');
const { LauncherPaths } = require('./core/paths');
const { HttpClient } = require('./core/http-client');
const { DownloadManager } = require('./core/download-manager');
const { EncryptedFileVault } = require('./core/secret-vault');
const { SettingsService } = require('./services/settings-service');
const { InstanceService } = require('./services/instance-service');
const { AccountService } = require('./services/account-service');
const { VersionService } = require('./services/version-service');
const { JavaService } = require('./services/java-service');
const { LoaderService } = require('./services/loader-service');
const { InstallService } = require('./services/install-service');
const { ModrinthProvider } = require('./providers/modrinth-provider');
const { CurseForgeProvider } = require('./providers/curseforge-provider');
const { ProviderRegistry } = require('./providers/provider-registry');
const { ModService } = require('./services/mod-service');
const { ModpackService } = require('./services/modpack-service');
const { BackupService } = require('./services/backup-service');
const { GameService } = require('./services/game-service');
const { ServerService } = require('./services/server-service');
const { DiagnosticsService } = require('./services/diagnostics-service');

class LauncherBackend {
  constructor(options = {}) {
    this.version = options.version || packageJson.version;
    this.events = options.events || new EventEmitter({ captureRejections: true });
    this.paths = new LauncherPaths(options.dataDir).ensure();
    this.vault = options.vault || new EncryptedFileVault(this.paths.state);
    this.settings = new SettingsService(this.paths, this.events);
    const settings = this.settings.get();
    this.http = options.http || new HttpClient({
      userAgent: options.userAgent || `Cobblestone/${this.version}`,
      fetchImpl: options.fetchImpl,
      allowHttp: settings.downloads.allowInsecureHttp,
    });
    this.downloads = new DownloadManager({
      http: this.http, concurrency: settings.downloads.concurrency, retries: settings.downloads.retries,
    });
    this.instances = new InstanceService(this.paths, this.events);
    this.accounts = new AccountService(this.paths, this.events, this.vault, options.auth || {});
    this.versions = new VersionService(this.paths, this.http);
    this.java = new JavaService(this.paths, this.settings, this.versions, this.downloads, this.events);
    this.loaders = new LoaderService(this.paths, this.http, this.downloads, this.events);
    this.installation = new InstallService(
      this.paths, this.settings, this.instances, this.versions, this.java, this.loaders, this.events,
    );
    this.providers = new ProviderRegistry([
      new ModrinthProvider(this.http),
      new CurseForgeProvider(this.http, this.vault),
    ]);
    this.mods = new ModService(
      this.paths, this.settings, this.instances, this.providers, this.downloads, this.events,
    );
    this.modpacks = new ModpackService(this.paths, this.instances, this.providers, this.downloads, this.events);
    this.backups = new BackupService(this.paths, this.settings, this.instances, this.events);
    this.mods.setBackupService(this.backups);
    this.game = new GameService(
      this.paths, this.settings, this.instances, this.accounts, this.java, this.installation, this.events,
    );
    this.servers = new ServerService();
    this.diagnostics = new DiagnosticsService(
      this.paths, this.settings, this.versions, this.java, this.instances, this.mods, this.providers, this.http,
    );
    this.downloads.on('progress', (event) => this.events.emit('download:progress', event));
    this.events.on('settings:changed', (next) => {
      this.downloads.setConcurrency(next.downloads.concurrency);
      this.http.allowHttp = next.downloads.allowInsecureHttp;
    });
  }

  status() {
    return {
      name: 'Cobblestone', version: this.version, dataDirectory: this.paths.data,
      runningGames: this.game.list(), downloads: this.downloads.list(),
      instances: this.instances.list().length, accounts: this.accounts.list().accounts.length,
      providers: this.providers.list(),
    };
  }

  async shutdown() {
    await this.game.stopAll();
    this.events.emit('backend:shutdown');
  }
}

function createLauncherBackend(options = {}) { return new LauncherBackend(options); }

module.exports = {
  LauncherBackend,
  createLauncherBackend,
  errors: require('./core/errors'),
};
