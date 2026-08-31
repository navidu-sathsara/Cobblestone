'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const AdmZip = require('adm-zip');
const tar = require('tar');
const { resolveInside } = require('../core/paths');
const { ConfigurationError, IntegrityError } = require('../core/errors');

const SUPPORTED_MAJORS = [8, 17, 21, 25];

function javaMajor(version) {
  const legacy = String(version).match(/^1\.(\d+)/);
  if (legacy) return Number(legacy[1]);
  const modern = String(version).match(/^(\d+)/);
  return modern ? Number(modern[1]) : null;
}

function compatible(required, actual) {
  return required === 8 ? actual === 8 : actual >= required;
}

class JavaService {
  constructor(paths, settings, versions, downloads, events) {
    this.paths = paths;
    this.settings = settings;
    this.versions = versions;
    this.downloads = downloads;
    this.events = events;
  }

  probe(executable, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const child = spawn(executable, ['-XshowSettings:properties', '-version'], { windowsHide: true });
      let output = '';
      const timeout = setTimeout(() => child.kill(), timeoutMs);
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.once('error', () => { clearTimeout(timeout); resolve(null); });
      child.once('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) return resolve(null);
        const version = output.match(/java\.version\s*=\s*([^\s]+)/i)?.[1]
          || output.match(/version\s+"([^"]+)"/i)?.[1]
          || 'unknown';
        const architecture = output.match(/os\.arch\s*=\s*([^\s]+)/i)?.[1] || null;
        resolve({ path: executable, version, major: javaMajor(version), architecture });
      });
    });
  }

  async detect() {
    const candidates = new Set(['java']);
    const roots = [];
    if (process.platform === 'win32') {
      roots.push('C:\\Program Files\\Java', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Microsoft');
    } else if (process.platform === 'darwin') {
      roots.push('/Library/Java/JavaVirtualMachines');
    } else roots.push('/usr/lib/jvm', '/opt/java');
    roots.push(path.join(os.homedir(), '.jdks'), this.paths.java);

    for (const root of roots) {
      for (const executable of this.#findBinaries(root, 5)) candidates.add(executable);
    }
    const results = await Promise.all([...candidates].map((candidate) => this.probe(candidate)));
    const unique = new Map(results.filter(Boolean).map((result) => [`${result.major}:${result.path}`, result]));
    return [...unique.values()].sort((a, b) => (b.major || 0) - (a.major || 0));
  }

  #findBinaries(root, maxDepth, depth = 0) {
    if (depth > maxDepth) return [];
    const binary = process.platform === 'win32' ? 'java.exe' : 'java';
    const results = [];
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const full = path.join(root, entry.name);
        if (entry.isFile() && entry.name.toLowerCase() === binary) results.push(full);
        else if (entry.isDirectory()) results.push(...this.#findBinaries(full, maxDepth, depth + 1));
      }
    } catch { /* absent or inaccessible directory */ }
    return results;
  }

  async ensureForMinecraft(minecraftVersion, override = null) {
    const required = await this.versions.requiredJava(minecraftVersion).catch(() => this.versions.fallbackJava(minecraftVersion));
    if (override) {
      const result = await this.probe(override);
      if (!result || !compatible(required, result.major)) {
        throw new ConfigurationError(`Configured Java is incompatible; Minecraft ${minecraftVersion} requires Java ${required}`, { result });
      }
      return result.path;
    }

    const configured = this.settings.get().java.paths[String(required)];
    if (configured) {
      const result = await this.probe(configured);
      if (result && compatible(required, result.major)) return result.path;
    }
    const managed = this.#findBinaries(path.join(this.paths.java, String(required)), 5)[0];
    if (managed && await this.probe(managed)) return managed;
    const detected = (await this.detect()).find((candidate) => compatible(required, candidate.major));
    if (detected) {
      await this.#remember(required, detected.path);
      return detected.path;
    }
    if (!this.settings.get().java.autoManage) {
      throw new ConfigurationError(`Java ${required} is required but automatic runtime management is disabled`);
    }
    return this.install(required);
  }

  async install(major) {
    if (!SUPPORTED_MAJORS.includes(Number(major))) {
      throw new ConfigurationError('Unsupported managed Java version', { major, supported: SUPPORTED_MAJORS });
    }
    const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
    const architecture = process.arch === 'arm64' ? 'aarch64' : 'x64';
    const extension = platform === 'windows' ? 'zip' : 'tar.gz';
    const id = crypto.randomUUID();
    const archive = path.join(this.paths.downloads, `java-${major}-${id}.${extension}`);
    const staging = path.join(this.paths.java, `.staging-${major}-${id}`);
    const destination = path.join(this.paths.java, String(major));
    const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${platform}/${architecture}/jre/hotspot/normal/eclipse`;
    this.events.emit('java:install', { major, status: 'downloading' });
    await this.downloads.download({ url, destination: archive, retries: 4 });
    await fsp.mkdir(staging, { recursive: true });
    try {
      this.events.emit('java:install', { major, status: 'extracting' });
      if (platform === 'windows') await this.#extractZip(archive, staging);
      else await tar.x({ file: archive, cwd: staging, strict: true, preservePaths: false });
      const binary = this.#findBinaries(staging, 6)[0];
      if (!binary) throw new IntegrityError('Downloaded runtime has no Java executable');
      if (process.platform !== 'win32') await fsp.chmod(binary, 0o755);
      const probe = await this.probe(binary);
      if (!probe || !compatible(major, probe.major)) throw new IntegrityError('Downloaded runtime failed validation', { probe });
      if (fs.existsSync(destination)) {
        await fsp.rename(destination, path.join(this.paths.trash, `java-${major}-${Date.now()}`));
      }
      await fsp.rename(staging, destination);
      const installed = this.#findBinaries(destination, 6)[0];
      await this.#remember(major, installed);
      this.events.emit('java:install', { major, status: 'completed', path: installed });
      return installed;
    } catch (error) {
      await fsp.rm(staging, { recursive: true, force: true });
      this.events.emit('java:install', { major, status: 'failed', error: error.message });
      throw error;
    } finally {
      await fsp.rm(archive, { force: true });
    }
  }

  async #extractZip(archive, destination) {
    const zip = new AdmZip(archive);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const target = resolveInside(destination, entry.entryName);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, entry.getData());
    }
  }

  async #remember(major, executable) {
    const current = this.settings.get();
    await this.settings.set({ java: { ...current.java, paths: { ...current.java.paths, [String(major)]: executable } } });
  }
}

module.exports = { JavaService, SUPPORTED_MAJORS, javaMajor, compatible };
