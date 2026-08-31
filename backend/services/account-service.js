'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { z } = require('zod');
const { Auth } = require('msmc');
const { JsonStore } = require('../core/json-store');
const { AuthenticationError, NotFoundError, ValidationError } = require('../core/errors');

const AccountSchema = z.object({
  id: z.string(),
  type: z.enum(['microsoft', 'offline']),
  username: z.string().min(1).max(64),
  uuid: z.string().nullable(),
  createdAt: z.number().int(),
  lastAuthenticatedAt: z.number().int().nullable(),
});

function offlineUuid(username) {
  const bytes = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x30;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class AccountService {
  constructor(paths, events, vault, { authFactory = (prompt) => new Auth(prompt) } = {}) {
    this.events = events;
    this.vault = vault;
    this.authFactory = authFactory;
    this.sessions = new Map();
    this.loginPromise = null;
    this.store = new JsonStore(path.join(paths.state, 'accounts.json'), { schemaVersion: 1, activeId: null, accounts: [] }, {
      validate: (value) => ({
        schemaVersion: 1,
        activeId: value?.activeId || null,
        accounts: (value?.accounts || []).map((account) => AccountSchema.parse(account)),
      }),
    });
  }

  list() { return this.store.readSync(); }

  get(id = this.list().activeId) {
    const account = this.list().accounts.find((item) => item.id === id);
    if (!account) throw new NotFoundError('Account', id);
    return account;
  }

  async loginMicrosoft() {
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = this.#performMicrosoftLogin();
    try { return await this.loginPromise; } finally { this.loginPromise = null; }
  }

  async #performMicrosoftLogin() {
    const manager = this.authFactory('select_account');
    manager.on?.('load', (stage, message) => this.events.emit('auth:progress', { stage, message }));
    this.events.emit('auth:progress', { stage: 'browser', message: 'Waiting for Microsoft sign-in' });
    try {
      // msmc's raw flow discovers Chromium's remote-debugging port from the
      // spawned browser's stderr. Setting `suppress: true` also suppresses that
      // parser, leaving the OAuth promise pending forever after sign-in.
      const xbox = await manager.launch('raw', { width: 540, height: 760 });
      const minecraft = await xbox.getMinecraft();
      if (!minecraft.profile?.id || !minecraft.profile?.name) {
        throw new AuthenticationError('This account does not expose a Minecraft Java profile');
      }
      const now = Date.now();
      const account = AccountSchema.parse({
        id: minecraft.profile.id,
        type: 'microsoft',
        username: minecraft.profile.name,
        uuid: minecraft.profile.id,
        createdAt: now,
        lastAuthenticatedAt: now,
      });
      await this.vault.set(`microsoft:${account.id}`, xbox.save());
      this.sessions.set(account.id, minecraft);
      await this.store.update((data) => {
        const previous = data.accounts.find((item) => item.id === account.id);
        data.accounts = data.accounts.filter((item) => item.id !== account.id);
        data.accounts.push({ ...account, createdAt: previous?.createdAt || account.createdAt });
        data.activeId = account.id;
      });
      this.events.emit('auth:changed', this.list());
      return account;
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError(error?.message || 'Microsoft sign-in failed', undefined, { cause: error });
    }
  }

  async addOffline(username) {
    const name = String(username || '').trim();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) {
      throw new ValidationError('Offline username must be 1-16 letters, numbers, or underscores');
    }
    const account = AccountSchema.parse({
      id: `offline-${crypto.randomUUID()}`,
      type: 'offline', username: name, uuid: null,
      createdAt: Date.now(), lastAuthenticatedAt: null,
    });
    await this.store.update((data) => {
      data.accounts.push(account);
      data.activeId ||= account.id;
    });
    this.events.emit('auth:changed', this.list());
    return account;
  }

  async setActive(id) {
    this.get(id);
    const result = await this.store.update((data) => { data.activeId = id; });
    this.events.emit('auth:changed', result);
    return this.get(id);
  }

  async remove(id) {
    this.get(id);
    this.sessions.delete(id);
    await this.vault.delete(`microsoft:${id}`);
    const result = await this.store.update((data) => {
      data.accounts = data.accounts.filter((item) => item.id !== id);
      if (data.activeId === id) data.activeId = data.accounts[0]?.id || null;
    });
    this.events.emit('auth:changed', result);
    return true;
  }

  async authorization(id = this.list().activeId) {
    const account = this.get(id);
    if (account.type === 'offline') {
      return {
        accessToken: '0',
        gameProfile: { name: account.username, id: offlineUuid(account.username).replaceAll('-', '') },
        userType: 'legacy',
        properties: {},
      };
    }
    let minecraft = this.sessions.get(account.id);
    if (!minecraft || (typeof minecraft.validate === 'function' && !minecraft.validate())) {
      const refresh = await this.vault.get(`microsoft:${account.id}`);
      if (!refresh) throw new AuthenticationError('Microsoft session is missing; sign in again');
      try {
        const manager = this.authFactory('select_account');
        const xbox = await manager.refresh(refresh);
        minecraft = await xbox.getMinecraft();
        await this.vault.set(`microsoft:${account.id}`, xbox.save());
        this.sessions.set(account.id, minecraft);
        await this.store.update((data) => {
          const saved = data.accounts.find((item) => item.id === account.id);
          if (saved) {
            saved.username = minecraft.profile?.name || saved.username;
            saved.uuid = minecraft.profile?.id || saved.uuid;
            saved.lastAuthenticatedAt = Date.now();
          }
        });
      } catch (error) {
        throw new AuthenticationError('Microsoft session expired; sign in again', { id: account.id }, { cause: error });
      }
    }
    const authorization = minecraft.mclc();
    return {
      accessToken: authorization.access_token,
      gameProfile: { name: authorization.name, id: authorization.uuid },
      userType: 'mojang',
      properties: authorization.user_properties || {},
    };
  }
}

module.exports = { AccountService, AccountSchema, offlineUuid };
