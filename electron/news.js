const fs = require('fs');
const path = require('path');
const { fetchJson, writeFileAtomic } = require('./download');

const NEWS_URL = 'https://launchercontent.mojang.com/v2/news.json';
const NEWS_ORIGIN = 'https://launchercontent.mojang.com';
const CACHE_MAX_AGE = 15 * 60 * 1000;
let deps = null;
let memoryCache = null;

const cachePath = () => path.join(deps.app.getPath('userData'), 'news-cache.json');

function safeHttpsUrl(value, base) {
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeEntries(payload) {
  if (!Array.isArray(payload?.entries)) return [];

  return payload.entries
    .map((entry) => ({
      id: String(entry.id || entry.readMoreLink || entry.title || ''),
      title: String(entry.title || '').trim(),
      summary: String(entry.text || '').replace(/\s+/g, ' ').trim(),
      category: String(entry.category || 'Minecraft').trim(),
      date: String(entry.date || ''),
      image: safeHttpsUrl(
        entry.newsPageImage?.url || entry.playPageImage?.url,
        NEWS_ORIGIN
      ),
      url: safeHttpsUrl(entry.readMoreLink, 'https://www.minecraft.net')
    }))
    .filter((entry) => entry.id && entry.title && entry.image && entry.url)
    .slice(0, 6);
}

function readDiskCache() {
  try {
    const saved = JSON.parse(fs.readFileSync(cachePath(), 'utf8'));
    return Array.isArray(saved?.items) ? saved : null;
  } catch {
    return null;
  }
}

async function listNews({ force = false } = {}) {
  const cached = memoryCache || readDiskCache();
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE) {
    memoryCache = cached;
    return { items: cached.items, stale: false, fetchedAt: cached.fetchedAt };
  }

  try {
    const payload = await fetchJson(NEWS_URL, { retries: 2, timeoutMs: 15000 });
    const items = normalizeEntries(payload);
    if (items.length === 0) throw new Error('The Minecraft news feed returned no articles');

    memoryCache = { fetchedAt: Date.now(), items };
    writeFileAtomic(cachePath(), JSON.stringify(memoryCache));
    return { items, stale: false, fetchedAt: memoryCache.fetchedAt };
  } catch (error) {
    if (cached?.items?.length) {
      memoryCache = cached;
      return { items: cached.items, stale: true, fetchedAt: cached.fetchedAt };
    }
    throw error;
  }
}

function init(dependencies, ipcMain) {
  deps = dependencies;
  ipcMain.handle('news:list', (_event, options) => listNews(options));
}

module.exports = { init, listNews, normalizeEntries };
