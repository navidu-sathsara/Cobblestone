import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { attempt, bridge, subscribe } from '../../lib/bridge.js';

/** Version string for the rail footer, from the backend's own status report. */
export function useBackendVersion() {
  const [version, setVersion] = useState(null);
  useEffect(() => {
    let cancelled = false;
    bridge.status()
      .then((status) => { if (!cancelled) setVersion(status?.version || null); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return version;
}

/**
 * Account list plus the active account, kept in sync through `auth:changed`.
 * Backs the titlebar account pill and its menu.
 */
export function useAccounts(onError) {
  const [store, setStore] = useState({ activeId: null, accounts: [] });
  const [login, setLogin] = useState({ busy: false, stage: null, message: null });

  const refresh = useCallback(async () => {
    const next = await attempt(() => bridge.accounts.list(), onError);
    if (next) setStore({ activeId: next.activeId, accounts: next.accounts || [] });
  }, [onError]);

  useEffect(() => {
    refresh();
    const offChanged = subscribe('auth:changed', (next) => {
      setStore({ activeId: next?.activeId ?? null, accounts: next?.accounts || [] });
    });
    const offProgress = subscribe('auth:progress', ({ stage, message } = {}) => {
      setLogin((current) => ({ ...current, stage: stage || null, message: message || 'Signing in…' }));
    });
    return () => { offChanged(); offProgress(); };
  }, [refresh]);

  const active = useMemo(
    () => store.accounts.find((account) => account.id === store.activeId) || store.accounts[0] || null,
    [store],
  );

  const loginMicrosoft = useCallback(async () => {
    if (login.busy) return null;
    setLogin({ busy: true, stage: 'browser', message: 'Opening Microsoft sign-in…' });
    const account = await attempt(() => bridge.accounts.loginMicrosoft(), onError);
    if (account) {
      await refresh();
      setLogin({ busy: false, stage: 'complete', message: `Signed in as ${account.username}` });
    } else {
      setLogin({ busy: false, stage: 'failed', message: 'Microsoft sign-in did not complete' });
    }
    return account;
  }, [login.busy, onError, refresh]);

  return {
    accounts: store.accounts,
    active,
    login,
    setActive: useCallback(
      (id) => attempt(() => bridge.accounts.setActive(id), onError),
      [onError],
    ),
    addOffline: useCallback(
      (username) => attempt(() => bridge.accounts.addOffline(username), onError),
      [onError],
    ),
    loginMicrosoft,
  };
}

function byRecency(a, b) {
  return (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0);
}

/**
 * The instance the LAUNCH GAME button acts on. Defaults to the most recently
 * played instance and follows instance create/update/delete events.
 */
export function useLaunchTarget(onError) {
  const [instances, setInstances] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);

  const refresh = useCallback(async () => {
    const list = await attempt(() => bridge.instances.list(), onError);
    if (list) setInstances([...list].sort(byRecency));
  }, [onError]);

  useEffect(() => {
    refresh();
    const unsubscribes = ['instance:created', 'instance:updated', 'instance:deleted']
      .map((name) => subscribe(name, refresh));
    return () => { for (const off of unsubscribes) off(); };
  }, [refresh]);

  const instance = useMemo(
    () => instances.find((item) => item.id === selectedId) || instances[0] || null,
    [instances, selectedId],
  );

  /**
   * Creates a first instance on the newest Minecraft release so a fresh install
   * has something to launch. Vanilla by default: no loader resolution can fail.
   */
  const createDefault = useCallback(async () => {
    if (creatingRef.current) return null;
    creatingRef.current = true;
    setCreating(true);
    try {
      const releases = await attempt(() => bridge.versions.list({ types: ['release'], limit: 1 }), onError);
      const latest = releases?.[0]?.id;
      if (!latest) return null;
      const created = await attempt(
        () => bridge.instances.create({ name: 'Cobblestone', minecraftVersion: latest, loader: 'vanilla' }),
        onError,
      );
      if (created) {
        setInstances((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        setSelectedId(created.id);
      }
      return created;
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [onError]);

  return { instance, instances, select: setSelectedId, createDefault, creating };
}

const BUSY_STATUSES = new Set(['preparing', 'installing', 'launching', 'stopping']);

/**
 * Live launch state for one instance. `game:state` carries the status/detail the
 * button surfaces; `game:install` narrates the file-verification phase.
 */
export function useGameSession(instanceId, onError) {
  const [session, setSession] = useState({ status: 'idle', detail: null });
  const instanceRef = useRef(instanceId);
  instanceRef.current = instanceId;

  useEffect(() => {
    setSession({ status: 'idle', detail: null });
    if (!instanceId) return undefined;

    let cancelled = false;
    bridge.game.list()
      .then((running) => {
        const match = running?.find((item) => item.instanceId === instanceId);
        if (!cancelled && match) setSession({ status: 'running', detail: 'Minecraft is running' });
      })
      .catch(() => undefined);

    const offState = subscribe('game:state', (event) => {
      if (event?.instanceId !== instanceRef.current) return;
      setSession({
        status: event.status === 'stopped' || event.status === 'failed' ? 'idle' : event.status,
        detail: event.detail || null,
      });
    });
    const offInstall = subscribe('game:install', (event) => {
      if (event?.instanceId !== instanceRef.current || event.status === 'completed') return;
      setSession((current) => (BUSY_STATUSES.has(current.status)
        ? { ...current, detail: `Verifying ${event.phase} files` }
        : current));
    });

    return () => { cancelled = true; offState(); offInstall(); };
  }, [instanceId]);

  const busy = BUSY_STATUSES.has(session.status);
  const running = session.status === 'running';

  /**
   * Starts the game. `options` is forwarded to GameService#launch, so
   * `{ server: 'mc.example.net' }` performs a quick-connect launch.
   */
  const launch = useCallback(async (options = undefined) => {
    if (!instanceId || busy || running) return;
    setSession({ status: 'preparing', detail: 'Starting up' });
    const started = await attempt(() => bridge.game.launch(instanceId, options), onError);
    if (!started) setSession({ status: 'idle', detail: null });
  }, [instanceId, busy, running, onError]);

  const stop = useCallback(async () => {
    if (!instanceId || busy) return;
    await attempt(() => bridge.game.stop(instanceId), onError);
  }, [instanceId, busy, onError]);

  const toggle = useCallback(() => (running ? stop() : launch()), [running, stop, launch]);

  return { status: session.status, detail: session.detail, busy, running, launch, stop, toggle };
}

/**
 * Pings every partnered server with the backend's native server-list ping to
 * get real player counts, latency and (when the server sends one) its icon.
 */
export function useServerStatus(servers) {
  const [statuses, setStatuses] = useState({});

  useEffect(() => {
    let cancelled = false;
    setStatuses({});
    for (const server of servers) {
      bridge.servers.ping(server.address)
        .then((result) => {
          if (cancelled) return;
          setStatuses((current) => ({ ...current, [server.id]: result }));
        })
        .catch(() => {
          if (cancelled) return;
          setStatuses((current) => ({ ...current, [server.id]: { online: false } }));
        });
    }
    return () => { cancelled = true; };
  }, [servers]);

  return statuses;
}
