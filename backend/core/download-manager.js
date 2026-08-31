'use strict';

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { hashFile, replaceFileSync } = require('./files');
const { IntegrityError, NetworkError, ConflictError } = require('./errors');
const { retryable } = require('./http-client');

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class DownloadManager extends EventEmitter {
  constructor({ http, concurrency = 6, retries = 3 } = {}) {
    super();
    this.http = http;
    this.concurrency = Math.max(1, Math.min(32, Number(concurrency) || 6));
    this.defaultRetries = retries;
    this.tasks = new Map();
    this.destinations = new Map();
    this.queue = [];
    this.running = 0;
  }

  setConcurrency(value) {
    this.concurrency = Math.max(1, Math.min(32, Number(value) || 1));
    this.#drain();
  }

  list() { return [...this.tasks.values()].map((task) => this.#public(task)); }
  get(id) { const task = this.tasks.get(id); return task ? this.#public(task) : null; }

  download(specification) {
    const destination = path.resolve(specification.destination);
    const existingId = this.destinations.get(destination);
    if (existingId) return this.tasks.get(existingId).promise;

    const urls = (Array.isArray(specification.urls) ? specification.urls : [specification.url])
      .filter(Boolean)
      .map((value) => this.http.validateUrl(value).href);
    if (urls.length === 0) return Promise.reject(new NetworkError('No download URL was supplied'));

    const id = specification.id || crypto.randomUUID();
    if (this.tasks.has(id)) return Promise.reject(new ConflictError('Download task ID already exists', { id }));
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const task = {
      id, urls, destination, hashes: specification.hashes || {},
      expectedSize: Number(specification.size) || 0,
      headers: specification.headers || {},
      priority: Number(specification.priority) || 0,
      retries: specification.retries ?? this.defaultRetries,
      status: 'queued', received: 0, total: 0, speed: 0,
      createdAt: Date.now(), updatedAt: Date.now(), error: null,
      controller: null, pauseRequested: false, cancelRequested: false,
      resolve, reject, promise,
    };
    this.tasks.set(id, task);
    this.destinations.set(destination, id);
    this.queue.push(task);
    this.queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    this.#emit(task);
    this.#drain();
    return promise;
  }

  pause(id) {
    const task = this.tasks.get(id);
    if (!task || !['queued', 'running', 'retrying'].includes(task.status)) return false;
    task.pauseRequested = true;
    if (task.status === 'queued') {
      this.queue = this.queue.filter((candidate) => candidate !== task);
      task.status = 'paused';
      this.#emit(task);
    } else task.controller?.abort();
    return true;
  }

  resume(id) {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'paused') return false;
    task.pauseRequested = false;
    task.status = 'queued';
    this.queue.push(task);
    this.#emit(task);
    this.#drain();
    return true;
  }

  cancel(id, { discardPartial = false } = {}) {
    const task = this.tasks.get(id);
    if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) return false;
    task.cancelRequested = true;
    task.discardPartial = discardPartial;
    this.queue = this.queue.filter((candidate) => candidate !== task);
    task.controller?.abort();
    if (task.status === 'queued' || task.status === 'paused') this.#cancel(task);
    return true;
  }

  async #run(task) {
    this.running += 1;
    task.status = 'running';
    task.startedAt = Date.now();
    this.#emit(task);
    try {
      const result = await this.#transfer(task);
      task.status = 'completed';
      task.completedAt = Date.now();
      task.resolve(result);
    } catch (error) {
      if (task.pauseRequested) {
        task.status = 'paused';
      } else if (task.cancelRequested) {
        this.#cancel(task);
      } else {
        task.status = 'failed';
        task.error = { code: error.code || 'DOWNLOAD_FAILED', message: error.message };
        task.reject(error);
      }
    } finally {
      task.controller = null;
      task.updatedAt = Date.now();
      this.running -= 1;
      if (['completed', 'failed', 'cancelled'].includes(task.status)) {
        this.destinations.delete(task.destination);
      }
      this.#emit(task);
      this.#drain();
    }
  }

  async #transfer(task) {
    await fsp.mkdir(path.dirname(task.destination), { recursive: true });
    const partial = `${task.destination}.part`;
    let lastError;
    const attempts = Math.max(task.retries + 1, task.urls.length);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      task.controller = new AbortController();
      const url = task.urls[attempt % task.urls.length];
      try {
        let offset = 0;
        try { offset = (await fsp.stat(partial)).size; } catch { offset = 0; }
        if (task.expectedSize && offset > task.expectedSize) {
          await fsp.rm(partial, { force: true });
          offset = 0;
        }
        const response = await this.http.request(url, {
          headers: { ...task.headers, ...(offset ? { range: `bytes=${offset}-` } : {}) },
          retries: 0,
          timeoutMs: 10 * 60_000,
          signal: task.controller.signal,
        });
        if (!response.body) throw new NetworkError('Download returned no body', { url });
        const append = offset > 0 && response.status === 206;
        if (!append) offset = 0;
        const responseLength = Number(response.headers.get('content-length')) || 0;
        task.total = task.expectedSize || (responseLength ? offset + responseLength : 0);
        task.received = offset;
        const startedAt = Date.now();
        let lastEmittedAt = 0;
        const meter = new Transform({
          transform: (chunk, _encoding, callback) => {
            task.received += chunk.length;
            task.updatedAt = Date.now();
            const elapsed = Math.max(1, task.updatedAt - startedAt) / 1000;
            task.speed = Math.round((task.received - offset) / elapsed);
            if (task.updatedAt - lastEmittedAt >= 100) {
              lastEmittedAt = task.updatedAt;
              this.#emit(task);
            }
            callback(null, chunk);
          },
        });
        await pipeline(
          Readable.fromWeb(response.body), meter,
          fs.createWriteStream(partial, { flags: append ? 'a' : 'w' }),
        );
        if (task.expectedSize && task.received !== task.expectedSize) {
          throw new IntegrityError('Downloaded file size does not match metadata', {
            expected: task.expectedSize, actual: task.received,
          });
        }
        const algorithms = Object.keys(task.hashes).filter((name) => crypto.getHashes().includes(name));
        if (algorithms.length) {
          task.status = 'verifying';
          this.#emit(task);
          const actual = await hashFile(partial, algorithms);
          for (const algorithm of algorithms) {
            if (actual[algorithm].toLowerCase() !== String(task.hashes[algorithm]).toLowerCase()) {
              throw new IntegrityError(`${algorithm.toUpperCase()} checksum mismatch`, {
                expected: task.hashes[algorithm], actual: actual[algorithm],
              });
            }
          }
        }
        replaceFileSync(partial, task.destination);
        return { id: task.id, path: task.destination, bytes: task.received, url };
      } catch (error) {
        lastError = error;
        if (task.pauseRequested || task.cancelRequested) throw error;
        if (error instanceof IntegrityError) await fsp.rm(partial, { force: true });
        const canRetry = attempt + 1 < attempts
          && (error.retryable !== false)
          && (!(error instanceof NetworkError) || !error.details?.status || retryable(error.details.status));
        if (!canRetry) throw error;
        task.status = 'retrying';
        task.error = { code: error.code || 'DOWNLOAD_RETRY', message: error.message };
        this.#emit(task);
        await wait(Math.min(500 * 2 ** attempt, 8000));
        task.status = 'running';
      }
    }
    throw lastError;
  }

  #cancel(task) {
    task.status = 'cancelled';
    task.updatedAt = Date.now();
    if (task.discardPartial) fs.rmSync(`${task.destination}.part`, { force: true });
    const error = new NetworkError('Download cancelled', { id: task.id });
    task.error = { code: error.code, message: error.message };
    task.reject(error);
    this.destinations.delete(task.destination);
    this.#emit(task);
  }

  #drain() {
    while (this.running < this.concurrency && this.queue.length) {
      const task = this.queue.shift();
      if (task.status === 'queued') this.#run(task);
    }
  }

  #public(task) {
    return {
      id: task.id, status: task.status, destination: task.destination,
      received: task.received, total: task.total, speed: task.speed,
      percent: task.total ? Math.min(100, (task.received / task.total) * 100) : null,
      createdAt: task.createdAt, updatedAt: task.updatedAt, error: task.error,
    };
  }

  #emit(task) { this.emit('progress', this.#public(task)); }
}

module.exports = { DownloadManager };
