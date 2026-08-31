/**
 * Static home-page content.
 *
 * The launcher core deliberately ships no news feed and no social/friends
 * service (see docs/ADVANCED_BACKEND_GUIDE.md — "no telemetry or cloud
 * transport is present"), so these two lists are presentation data. Swap them
 * for a real source by replacing the exports; the components take them as props.
 */

/**
 * News cards. `image` is optional: when omitted the card paints a CSS artwork
 * gradient behind the wordmark, which is what the shipped build does. Point
 * `image` at a real asset or URL to show artwork instead (remote hosts must be
 * added to the img-src allowlist in electron/csp.js). `tone` is one of
 * 'copper' | 'amethyst' | 'verdant'.
 */
export const NEWS = [
  {
    id: 'cosmetics',
    title: 'Cosmetics',
    wordmark: 'Cosmetics',
    blurb: 'New capes, wings and hats',
    url: 'https://cobblestone.net/news/cosmetics',
    tone: 'amethyst',
    image: null,
  },
  {
    id: 'giveaways',
    title: 'Giveaways',
    wordmark: 'Giveaways',
    blurb: 'Monthly community giveaways',
    url: 'https://cobblestone.net/news/giveaways',
    tone: 'copper',
    image: null,
  },
  {
    id: 'modpacks',
    title: 'Modpacks',
    wordmark: 'Modpacks',
    blurb: 'One-click Modrinth packs',
    url: 'https://modrinth.com/modpacks',
    tone: 'verdant',
    image: null,
  },
];

/**
 * Friends list placeholder. `presence` is one of 'online' | 'idle' | 'offline'
 * and drives the indicator colour.
 */
export const FRIENDS = [
  { id: 'whoap', name: 'whoap', status: 'In Launcher', presence: 'idle' },
  { id: 'ender0809', name: 'Ender0809', status: 'Playing 1.21.11', presence: 'online' },
  { id: 'shiro', name: 'Shiro_Kaze', status: 'Playing 1.21.11', presence: 'online' },
  { id: 'nova', name: 'NovaDrift', status: 'Offline', presence: 'offline' },
];

/**
 * Partnered servers. Names, addresses and accent colours are static; the player
 * counts, online state and icons are resolved at runtime with the backend's
 * native server-list ping (`launcher.servers.ping`).
 */
export const PARTNERED_SERVERS = [
  { id: 'hypixel', name: 'Hypixel', address: 'mc.hypixel.net', accent: '#d8a03a' },
  { id: 'mineplex', name: 'Mineplex', address: 'mineplex.com', accent: '#d4542f' },
  { id: 'mccisland', name: 'MCC Island', address: 'mccisland.net', accent: '#4fae63' },
  { id: 'donutsmp', name: 'DonutSMP', address: 'donutsmp.net', accent: '#3f7ad4' },
  { id: 'hoplite', name: 'Hoplite', address: 'mc.hoplite.gg', accent: '#b23c3c' },
];

export const DISCORD_INVITE = { label: 'discord.gg/cobblestone', url: 'https://discord.gg/cobblestone' };

export const WEBSTORE = { label: 'cobblestone.net/store', url: 'https://cobblestone.net/store' };
