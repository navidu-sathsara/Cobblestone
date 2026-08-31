const COUNT_FORMAT = new Intl.NumberFormat('en-US');

/** 35000 -> "35,000". Matches the partnered-server counts in the design. */
export function formatCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? COUNT_FORMAT.format(value) : '—';
}

const LOADER_LABELS = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
};

export function formatLoader(loader) {
  return LOADER_LABELS[loader] || 'Vanilla';
}

/**
 * The launch button subtitle, e.g. "Cobblestone + Fabric 1.21.11". Vanilla
 * instances drop the loader name entirely.
 */
export function formatLaunchTarget(instance) {
  if (!instance) return 'No instance yet';
  const loader = instance.loader === 'vanilla' ? '' : `${formatLoader(instance.loader)} `;
  return `Cobblestone + ${loader}${instance.minecraftVersion}`;
}

/** mc-heads.net renders a player body from a name or UUID. */
export function bodyUrl(name, height = 400) {
  return `https://mc-heads.net/body/${encodeURIComponent(name || 'MHF_Steve')}/${height}`;
}

/** mc-heads.net renders a flat player head, used for avatars. */
export function headUrl(name, size = 64) {
  return `https://mc-heads.net/avatar/${encodeURIComponent(name || 'MHF_Steve')}/${size}`;
}

/**
 * Fallback partnered-server icon. A live status ping usually returns a favicon
 * data URI; this only runs when it does not.
 */
export function serverIconUrl(address) {
  return `https://api.mcsrvstat.us/icon/${encodeURIComponent(address)}`;
}
