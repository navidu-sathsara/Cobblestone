'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { launch: launchMinecraft } = require('@xmcl/core');
const { ConflictError, NotFoundError } = require('../core/errors');

const PHASES = {
  assets: 'Verifying assets',
  'assets-copy': 'Copying assets',
  natives: 'Downloading native libraries',
  classes: 'Downloading libraries',
  'classes-custom': 'Downloading loader libraries',
  'classes-maven-custom': 'Downloading loader libraries',
  'version-jar': 'Downloading Minecraft',
};

function redact(value) {
  return String(value)
    .replace(/(--accessToken\s+)\S+/gi, '$1[REDACTED]')
    .replace(/(authorization:\s*bearer\s+)\S+/gi, '$1[REDACTED]')
    .replace(/("accessToken"\s*:\s*")[^"]+/gi, '$1[REDACTED]');
}

class GameService {
  constructor(paths, settings, instances, accounts, java, installation, events) {
    this.paths = paths;
    this.settings = settings;
    this.instances = instances;
    this.accounts = accounts;
    this.java = java;
    this.installation = installation;
    this.events = events;
    this.active = new Map();
    this.launching = new Set();
  }

  list() {
    return [...this.active.values()].map((session) => ({
      launchId: session.launchId, instanceId: session.instanceId,
      pid: session.child?.pid || null, status: session.status, startedAt: session.startedAt,
    }));
  }

  status(instanceId) {
    const session = this.active.get(instanceId);
    return session ? this.list().find((item) => item.instanceId === instanceId) : null;
  }

  async launch(instanceId, { accountId, server, quickPlayPath } = {}) {
    if (this.active.has(instanceId) || this.launching.has(instanceId)) {
      throw new ConflictError('This instance is already launching or running', { instanceId });
    }
    const instance = this.instances.get(instanceId);
    const release = this.instances.acquireLock(instanceId, 'game-running');
    this.launching.add(instanceId);
    const launchId = crypto.randomUUID();
    try {
      this.#state(instanceId, launchId, 'preparing', 'Resolving Java runtime');
      const javaPath = await this.java.ensureForMinecraft(instance.minecraftVersion, instance.overrides.javaPath);
      this.#state(instanceId, launchId, 'installing', 'Verifying Minecraft and loader files');
      const installed = await this.installation.installUnlocked(instance, javaPath, { repair: false });
      this.#state(instanceId, launchId, 'preparing', 'Resolving account');
      const authorization = await this.accounts.authorization(accountId);
      const current = this.settings.get();
      const memory = instance.overrides.memory || {
        minimumMb: current.memory.minimumMb, maximumMb: current.memory.maximumMb,
      };
      const resolution = instance.overrides.resolution || current.game;
      const opts = {
        gamePath: this.paths.instance(instanceId),
        resourcePath: this.paths.game,
        version: installed.resolvedVersionId || installed.minecraftVersion,
        javaPath,
        minMemory: memory.minimumMb,
        maxMemory: memory.maximumMb,
        resolution: { width: resolution.width, height: resolution.height, fullscreen: resolution.fullscreen },
        accessToken: authorization.accessToken,
        gameProfile: authorization.gameProfile,
        userType: authorization.userType,
        properties: authorization.properties,
        extraExecOption: { cwd: this.paths.instance(instanceId), windowsHide: true },
      };
      const customArgs = instance.overrides.jvmArguments || current.game.jvmArguments;
      if (customArgs.length) opts.extraJVMArgs = customArgs;
      const gameArgs = [...(instance.overrides.gameArguments || current.game.gameArguments)];
      if (gameArgs.length) opts.extraMCArgs = gameArgs;
      if (server) {
        if (typeof server === 'string') {
          const [ip, rawPort] = server.split(':');
          opts.server = { ip, ...(rawPort ? { port: Number(rawPort) } : {}) };
        } else opts.server = server;
      }
      if (quickPlayPath) opts.quickPlaySingleplayer = quickPlayPath;

      this.#state(instanceId, launchId, 'launching', 'Starting Minecraft');
      const child = await launchMinecraft(opts);
      if (!child) throw new Error('Minecraft process was not created');
      const startedAt = Date.now();
      const session = { launchId, instanceId, child, startedAt, status: 'running', release };
      this.active.set(instanceId, session);
      this.launching.delete(instanceId);
      await this.instances.update(instanceId, { lastPlayedAt: startedAt, installState: 'ready' });
      this.#wireLogs(session);
      this.#wireProcess(session);
      this.#state(instanceId, launchId, 'running', 'Minecraft is running', { pid: child.pid });
      return { launchId, instanceId, pid: child.pid, startedAt };
    } catch (error) {
      this.launching.delete(instanceId);
      release();
      this.#state(instanceId, launchId, 'failed', error.message);
      throw error;
    }
  }

  async stop(instanceId, { forceAfterMs = 10_000 } = {}) {
    const session = this.active.get(instanceId);
    if (!session) throw new NotFoundError('Running game', instanceId);
    session.status = 'stopping';
    this.#state(instanceId, session.launchId, 'stopping', 'Stopping Minecraft');
    session.child.kill('SIGTERM');
    const timeout = setTimeout(() => {
      if (this.active.get(instanceId) === session) session.child.kill('SIGKILL');
    }, forceAfterMs);
    timeout.unref?.();
    return true;
  }

  async stopAll() {
    await Promise.allSettled([...this.active.keys()].map((id) => this.stop(id, { forceAfterMs: 3000 })));
  }

  #wireLogs(session) {
    const { instanceId, launchId, child } = session;
    const log = (line, level) => {
      const safe = redact(line);
      this.events.emit('game:log', { instanceId, launchId, level, line: safe });
      const logPath = path.join(this.paths.logs, `game-${launchId}.log`);
      fs.appendFile(logPath, `${new Date().toISOString()} ${level.toUpperCase()} ${safe}\n`, () => undefined);
    };
    child.stdout?.on('data', (line) => log(line, 'info'));
    child.stderr?.on('data', (line) => log(line, 'error'));
  }

  #wireProcess(session) {
    let finalized = false;
    const finish = async (code, signal, error = null) => {
      if (finalized) return;
      finalized = true;
      this.active.delete(session.instanceId);
      session.release();
      await this.instances.recordPlay(session.instanceId, session.startedAt).catch(() => undefined);
      this.#state(
        session.instanceId, session.launchId,
        error || (code !== 0 && code !== null) ? 'failed' : 'stopped',
        error?.message || (code === 0 || code === null ? 'Minecraft stopped' : `Minecraft exited with code ${code}`),
        { code, signal },
      );
    };
    session.child.once('error', (error) => finish(-1, null, error));
    session.child.once('close', (code, signal) => finish(code, signal));
  }

  #state(instanceId, launchId, status, detail, extra = {}) {
    this.events.emit('game:state', { instanceId, launchId, status, detail, ...extra });
  }
}

module.exports = { GameService, redact, PHASES };
