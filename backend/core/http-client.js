'use strict';

const { NetworkError } = require('./errors');

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryable(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(response, attempt) {
  const header = response?.headers?.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 60_000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 60_000));
  }
  return Math.min(500 * 2 ** attempt + Math.random() * 200, 10_000);
}

class HttpClient {
  constructor({ userAgent = 'Cobblestone/4.0.0', fetchImpl = globalThis.fetch, allowHttp = false } = {}) {
    this.userAgent = userAgent;
    this.fetchImpl = fetchImpl;
    this.allowHttp = allowHttp;
  }

  validateUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !(this.allowHttp && url.protocol === 'http:')) {
      throw new NetworkError('Only HTTPS downloads are allowed', { url: url.href });
    }
    return url;
  }

  async request(value, {
    method = 'GET', headers = {}, body, timeoutMs = 30_000, retries = 2, signal,
  } = {}) {
    const url = this.validateUrl(value);
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);
      const abort = () => controller.abort(signal.reason);
      if (signal) signal.addEventListener('abort', abort, { once: true });
      let response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: { 'user-agent': this.userAgent, accept: 'application/json', ...headers },
          body,
          redirect: 'follow',
          signal: controller.signal,
        });
        if (!response.ok) {
          const message = await response.text().catch(() => '');
          const error = new NetworkError(`Request failed with HTTP ${response.status}`, {
            url: url.href, status: response.status, body: message.slice(0, 1000),
          });
          error.retryable = retryable(response.status);
          throw error;
        }
        return response;
      } catch (error) {
        lastError = error?.name === 'AbortError'
          ? new NetworkError(signal?.aborted ? 'Request cancelled' : 'Request timed out', { url: url.href })
          : error;
        if (signal?.aborted || attempt >= retries || error.retryable === false) throw lastError;
        await wait(retryDelay(response, attempt));
      } finally {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener('abort', abort);
      }
    }
    throw lastError;
  }

  async json(value, options = {}) {
    const response = await this.request(value, options);
    try { return await response.json(); } catch (error) {
      throw new NetworkError('Server returned invalid JSON', { url: String(value) }, { cause: error });
    }
  }
}

module.exports = { HttpClient, retryable };
