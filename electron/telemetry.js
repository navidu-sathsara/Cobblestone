const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NATIVE_API = process.env.NATIVE_ACCOUNT_API || 'https://nativelaunch.xyz/api';
const rawFetch = global.fetch.bind(globalThis);
const MAX_QUEUE = 5000;
const BATCH_SIZE = 100;
const HEARTBEAT_MS = 60 * 1000;

let deps = null;
let queue = [];
let sessionId = null;
let lastHeartbeatAt = 0;
let heartbeatTimer = null;
let flushTimer = null;
let flushPromise = null;
let fetchTrackingInstalled = false;

const queuePath = () => path.join(deps.app.getPath('userData'), 'launcher-telemetry.json');
const profilePath = () => path.join(deps.app.getPath('userData'), 'launcher-profile-cache.json');

function eventId() {
  return `lt-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.slice(0, 20);
}

function readQueue() {
  try {
    const data = JSON.parse(fs.readFileSync(queuePath(), 'utf8'));
    queue = Array.isArray(data?.events) ? data.events.slice(-MAX_QUEUE) : [];
  } catch {
    queue = [];
  }
}

function saveQueue() {
  try {
    fs.mkdirSync(path.dirname(queuePath()), { recursive: true });
    fs.writeFileSync(queuePath(), JSON.stringify({ events: queue.slice(-MAX_QUEUE) }));
  } catch { /* activity sync must never interrupt the launcher */ }
}

function readProfileCache() {
  try {
    const cached = JSON.parse(fs.readFileSync(profilePath(), 'utf8'));
    return cached && typeof cached === 'object' ? cached : null;
  } catch {
    return null;
  }
}

function saveProfileCache(profile) {
  if (!profile || typeof profile !== 'object') return;
  try {
    fs.mkdirSync(path.dirname(profilePath()), { recursive: true });
    fs.writeFileSync(profilePath(), JSON.stringify({
      userId: profile.userId || null,
      minecraftUsername: profile.minecraftUsername || null,
      avatarUrl: profile.avatarUrl || null,
      activity: profile.activity || null
    }));
  } catch { /* the server remains the source of truth */ }
}

function sourceFor(url) {
  const host = url.hostname.toLowerCase();
  if (host.includes('minecraft.net') || host.includes('mojang.com')) return 'minecraft';
  if (host.includes('modrinth.com')) return 'modrinth';
  if (host.includes('curseforge.com')) return 'curseforge';
  if (host.includes('fabricmc.net')) return 'fabric';
  if (host.includes('minecraftforge.net') || host.includes('forgecdn.net')) return 'forge';
  if (host.includes('adoptium.net')) return 'java';
  if (host.includes('mc-heads.net')) return 'minecraft_skin';
  if (host.includes('nativelaunch.xyz')) return 'native_account';
  return host.split('.').slice(-2).join('.').replace(/[^a-z0-9_.-]/g, '') || 'other';
}

function fetchEvent(input, options, status, durationMs, failed = false) {
  try {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input?.url);
    if (url.href.startsWith(`${NATIVE_API}/launcher/telemetry`)) return;
    track('web_fetch', {
      source: sourceFor(url),
      host: url.host,
      path: url.pathname,
      method: String(options?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase(),
      status: Number(status) || 0,
      durationMs: Math.round(durationMs),
      failed
    });
  } catch { /* ignore non-HTTP or malformed request targets */ }
}

function installFetchTracking() {
  if (fetchTrackingInstalled) return;
  fetchTrackingInstalled = true;
  global.fetch = async (input, options = {}) => {
    const started = Date.now();
    try {
      const response = await rawFetch(input, options);
      fetchEvent(input, options, response.status, Date.now() - started, false);
      return response;
    } catch (error) {
      fetchEvent(input, options, 0, Date.now() - started, true);
      throw error;
    }
  };
}

function scheduleFlush(delay = 1500) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush().catch(() => {}), delay);
  flushTimer.unref?.();
}

function track(type, data = {}) {
  if (!deps) return null;
  const event = {
    id: eventId(),
    type,
    occurredAt: new Date().toISOString(),
    data: {
      ...data,
      sessionId,
      appVersion: deps.app.getVersion(),
      platform: process.platform,
      arch: process.arch
    }
  };
  queue.push(event);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  saveQueue();
  scheduleFlush();
  return event;
}

async function request(pathname, options = {}) {
  const account = deps.getLinkedNativeAccount?.();
  if (!account?.nativeToken) return { ok: false, linked: false };
  const response = await rawFetch(`${NATIVE_API}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${account.nativeToken}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, ok: response.ok && data.ok !== false, linked: response.status !== 401, status: response.status };
}

async function flush() {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    while (queue.length) {
      const batch = queue.slice(0, BATCH_SIZE);
      const result = await request('/launcher/telemetry', {
        method: 'POST',
        body: JSON.stringify({ events: batch })
      });
      if (!result.ok) break;
      const sent = new Set(batch.map(event => event.id));
      queue = queue.filter(event => !sent.has(event.id));
      saveQueue();
      if (result.activity) {
        const cached = readProfileCache();
        if (cached) saveProfileCache({ ...cached, activity: result.activity });
      }
      const win = deps.getWin?.();
      if (win && !win.isDestroyed()) win.webContents.send('telemetry:updated', result.activity || null);
    }
  })().finally(() => { flushPromise = null; });
  return flushPromise;
}

async function profile() {
  try {
    const result = await request('/launcher/activity', { method: 'GET' });
    if (!result.ok) {
      const linked = result.linked !== false;
      return { ok: false, linked, profile: linked ? readProfileCache() : null, offline: linked };
    }
    saveProfileCache(result.profile);
    return { ok: true, linked: true, profile: result.profile };
  } catch {
    const linked = Boolean(deps.getLinkedNativeAccount?.());
    return { ok: false, linked, profile: linked ? readProfileCache() : null, offline: linked };
  }
}

function heartbeat(type = 'launcher_session_heartbeat') {
  const now = Date.now();
  const deltaSeconds = Math.max(0, Math.min(600, Math.round((now - lastHeartbeatAt) / 1000)));
  lastHeartbeatAt = now;
  if (deltaSeconds || type === 'launcher_session_end') track(type, { deltaSeconds });
}

function startSession() {
  if (sessionId) return;
  readQueue();
  sessionId = `ls-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  lastHeartbeatAt = Date.now();
  track('launcher_session_start');
  heartbeatTimer = setInterval(() => heartbeat(), HEARTBEAT_MS);
  heartbeatTimer.unref?.();
  scheduleFlush(250);
}

function endSession() {
  if (!sessionId) return;
  clearInterval(heartbeatTimer);
  heartbeat('launcher_session_end');
  sessionId = null;
  saveQueue();
}

function init(dependencies, ipcMain) {
  deps = dependencies;
  installFetchTracking();
  ipcMain.on('telemetry:fetch', (_event, payload) => track('web_fetch', payload));
  ipcMain.handle('telemetry:profile', () => profile());
  ipcMain.handle('telemetry:flush', () => flush().then(() => ({ ok: true })).catch(() => ({ ok: false })));
}

module.exports = { init, startSession, endSession, track, flush, profile };
