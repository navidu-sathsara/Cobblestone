'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { writeFileAtomicSync } = require('./files');
const { LauncherError } = require('./errors');

class EncryptedFileVault {
  constructor(directory) {
    this.keyPath = path.join(directory, 'vault.key');
    this.dataPath = path.join(directory, 'vault.enc.json');
    this.queue = Promise.resolve();
  }

  #key() {
    fs.mkdirSync(path.dirname(this.keyPath), { recursive: true });
    if (!fs.existsSync(this.keyPath)) {
      writeFileAtomicSync(this.keyPath, crypto.randomBytes(32), { mode: 0o600 });
    }
    const key = fs.readFileSync(this.keyPath);
    if (key.length !== 32) throw new LauncherError('VAULT_ERROR', 'Secret vault key is invalid');
    try { fs.chmodSync(this.keyPath, 0o600); } catch { /* best effort on Windows */ }
    return key;
  }

  #readAll() {
    if (!fs.existsSync(this.dataPath)) return {};
    try {
      const envelope = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.#key(),
        Buffer.from(envelope.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(envelope.data, 'base64')),
        decipher.final(),
      ]);
      return JSON.parse(plain.toString('utf8'));
    } catch (error) {
      throw new LauncherError('VAULT_ERROR', 'Secret vault could not be decrypted', undefined, { cause: error });
    }
  }

  #writeAll(values) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.#key(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(values)), cipher.final()]);
    const envelope = {
      version: 1,
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
    };
    writeFileAtomicSync(this.dataPath, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
  }

  async get(key) { return this.#readAll()[key] ?? null; }

  async set(key, value) {
    return this.#enqueue(() => {
      const values = this.#readAll();
      values[key] = value;
      this.#writeAll(values);
    });
  }

  async delete(key) {
    return this.#enqueue(() => {
      const values = this.#readAll();
      delete values[key];
      this.#writeAll(values);
    });
  }

  #enqueue(action) {
    const run = this.queue.then(action);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

module.exports = { EncryptedFileVault };
