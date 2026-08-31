'use strict';

const fs = require('node:fs');
const path = require('node:path');
const lockfile = require('proper-lockfile');
const { writeFileAtomic, writeFileAtomicSync } = require('./files');

function clone(value) {
  return structuredClone(value);
}

class JsonStore {
  constructor(filePath, defaults, { validate = (value) => value } = {}) {
    this.filePath = filePath;
    this.defaults = defaults;
    this.validate = validate;
    this.queue = Promise.resolve();
  }

  ensureFile() {
    if (fs.existsSync(this.filePath)) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileAtomicSync(this.filePath, `${JSON.stringify(this.defaults, null, 2)}\n`, { mode: 0o600 });
  }

  readSync() {
    this.ensureFile();
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    return clone(this.validate(parsed));
  }

  async read() { return this.readSync(); }

  async write(value) {
    return this.#exclusive(async () => {
      const checked = this.validate(clone(value));
      await writeFileAtomic(this.filePath, `${JSON.stringify(checked, null, 2)}\n`, { mode: 0o600 });
      return clone(checked);
    });
  }

  async update(mutator) {
    return this.#exclusive(async () => {
      const current = this.readSync();
      const result = await mutator(current);
      const checked = this.validate(result === undefined ? current : result);
      await writeFileAtomic(this.filePath, `${JSON.stringify(checked, null, 2)}\n`, { mode: 0o600 });
      return clone(checked);
    });
  }

  async #exclusive(operation) {
    const run = this.queue.then(async () => {
      this.ensureFile();
      const release = await lockfile.lock(this.filePath, {
        realpath: false,
        retries: { retries: 8, factor: 1.4, minTimeout: 20, maxTimeout: 500 },
      });
      try { return await operation(); } finally { await release(); }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

module.exports = { JsonStore };
