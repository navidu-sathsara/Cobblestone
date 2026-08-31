import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, LayoutGrid, Package, Play, Plus, Search, Settings2, Trash2 } from 'lucide-react';
import { bridge } from '../../lib/bridge.js';
import { formatBuild, formatInstallState, formatPlaytime, formatRelative } from '../../lib/format.js';
import CreateInstanceModal from './instances/CreateInstanceModal.jsx';
import InspectorModal from './instances/InspectorModal.jsx';
import InstanceDrawer from './instances/InstanceDrawer.jsx';
import TrashModal from './instances/TrashModal.jsx';
import './InstancesPage.css';

const LOADERS = ['all', 'vanilla', 'fabric', 'forge', 'neoforge', 'quilt'];
const STATE_TONE = { ready: 'ok', installing: 'warn', broken: 'bad' };

function sortInstances(list, sort) {
  const copy = [...list];
  if (sort === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'playtime') return copy.sort((a, b) => (b.playTimeSeconds || 0) - (a.playTimeSeconds || 0));
  return copy.sort((a, b) => (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0));
}

function InstanceTile({ item, active, onOpen, onPlay, playDisabled }) {
  const tone = STATE_TONE[item.installState] || 'idle';
  return (
    <article
      className={`inst-tile${active ? ' inst-tile--active' : ''}`}
      data-testid={`instance-tile-${item.id}`}
    >
      <span className="inst-tile-mark" aria-hidden="true">
        {item.managedPack ? <Package size={20} /> : item.name.slice(0, 1).toUpperCase()}
      </span>

      <span className={`inst-tile-state inst-tile-state--${tone}`}>{formatInstallState(item.installState)}</span>

      <button
        type="button"
        className="inst-tile-open"
        data-testid={`instance-tile-open-${item.id}`}
        onClick={() => onOpen(item.id)}
      >
        <span className="inst-tile-name">{item.name}</span>
        <span className="inst-tile-build">{formatBuild(item)}</span>
      </button>

      <span className="inst-tile-foot">
        <small>{formatPlaytime(item.playTimeSeconds)}</small>
        <small>{item.lastPlayedAt ? formatRelative(item.lastPlayedAt) : 'Never launched'}</small>
      </span>

      <span className="inst-tile-actions">
        <button
          type="button"
          className="ui-btn ui-btn--primary ui-btn--sm"
          disabled={playDisabled}
          data-testid={`instance-tile-play-${item.id}`}
          onClick={() => onPlay(item.id)}
        >
          <Play size={13} fill="currentColor" /> Play
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--secondary ui-btn--sm"
          data-testid={`instance-tile-manage-${item.id}`}
          onClick={() => onOpen(item.id)}
        >
          <Settings2 size={13} /> Manage
        </button>
      </span>
    </article>
  );
}

/**
 * Local library. A filterable tile grid is the primary surface and every
 * per-instance control lives in a slide-in drawer, so the page holds one idea
 * at a time instead of a cramped two-pane workspace.
 */
export default function InstancesPage({
  instances, instance, session, onSelect, onRefresh, onError, onOpenContent,
}) {
  const [query, setQuery] = useState('');
  const [loader, setLoader] = useState('all');
  const [sort, setSort] = useState('recent');
  const [creating, setCreating] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [inspector, setInspector] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleted, setDeleted] = useState([]);
  const [busy, setBusy] = useState(null);

  const refreshTrash = useCallback(() => (
    bridge.instances.deleted()
      .then((items) => setDeleted(items || []))
      .catch((error) => onError(error.message))
  ), [onError]);

  useEffect(() => { refreshTrash(); }, [refreshTrash]);

  const operate = useCallback(async (key, action, { selectId = null, closeDrawer = false } = {}) => {
    if (busy) return null;
    setBusy(key);
    try {
      const result = await action();
      await onRefresh();
      await refreshTrash();
      if (selectId) onSelect(typeof selectId === 'function' ? selectId(result) : selectId);
      if (closeDrawer) setDrawerOpen(false);
      return result;
    } catch (error) {
      onError(error.message);
      return null;
    } finally {
      setBusy(null);
    }
  }, [busy, onError, onRefresh, onSelect, refreshTrash]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortInstances(instances.filter((item) => (
      (loader === 'all' || item.loader === loader)
      && (!needle || item.name.toLowerCase().includes(needle))
    )), sort);
  }, [instances, loader, query, sort]);

  const open = useCallback((id) => {
    onSelect(id);
    setDrawerOpen(true);
  }, [onSelect]);

  const play = useCallback((id) => {
    onSelect(id);
    if (session.running || session.busy) return;
    session.launch();
  }, [onSelect, session]);

  return (
    <main className="ui-page instances-page scroll-thin" data-testid="instances-page">
      <header className="ui-page-head">
        <span>
          <small>Local library</small>
          <h1>Instances</h1>
          <p>Every Minecraft setup you own, isolated on disk and ready to launch.</p>
        </span>
        <div className="ui-page-actions">
          <button
            type="button"
            className="ui-btn ui-btn--secondary"
            data-testid="instances-trash-open"
            onClick={() => setTrashOpen(true)}
          >
            <Trash2 size={15} /> Trash{deleted.length ? ` (${deleted.length})` : ''}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            data-testid="instances-create-open"
            onClick={() => setCreating(true)}
          >
            <Plus size={16} /> New instance
          </button>
        </div>
      </header>

      <div className="inst-toolbar">
        <label className="inst-search">
          <Search size={16} />
          <input
            value={query}
            placeholder="Filter by name…"
            aria-label="Filter instances by name"
            data-testid="instances-search"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="ui-seg" role="group" aria-label="Filter by loader">
          {LOADERS.map((id) => (
            <button
              type="button"
              key={id}
              aria-pressed={loader === id}
              data-testid={`instances-filter-${id}`}
              onClick={() => setLoader(id)}
            >
              {id === 'all' ? 'All' : id === 'neoforge' ? 'NeoForge' : id[0].toUpperCase() + id.slice(1)}
            </button>
          ))}
        </div>

        <label className="inst-sort">
          <ArrowUpDown size={14} />
          <select
            value={sort}
            aria-label="Sort instances"
            data-testid="instances-sort"
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="recent">Recently played</option>
            <option value="name">Name A–Z</option>
            <option value="playtime">Most played</option>
          </select>
        </label>

        <span className="inst-count" data-testid="instances-count">
          {visible.length} of {instances.length}
        </span>
      </div>

      {visible.length ? (
        <div className="inst-grid" data-testid="instances-grid">
          {visible.map((item, index) => (
            <div key={item.id} className="inst-grid-cell" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
              <InstanceTile
                item={item}
                active={item.id === instance?.id}
                onOpen={open}
                onPlay={play}
                playDisabled={Boolean(busy) || (item.id === instance?.id && (session.busy || session.running))}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="ui-empty" data-testid="instances-empty">
          <LayoutGrid size={30} />
          <h2>{instances.length ? 'Nothing matches that filter' : 'Build your first instance'}</h2>
          <p>
            {instances.length
              ? 'Clear the search or pick a different loader to see the rest of your library.'
              : 'Choose a Minecraft version and mod loader, then add content from Modrinth.'}
          </p>
          {instances.length ? (
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              data-testid="instances-clear-filters"
              onClick={() => { setQuery(''); setLoader('all'); }}
            >
              Clear filters
            </button>
          ) : (
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              data-testid="instances-empty-create"
              onClick={() => setCreating(true)}
            >
              <Plus size={16} /> Create instance
            </button>
          )}
        </div>
      )}

      {drawerOpen && instance ? (
        <InstanceDrawer
          instance={instance}
          session={session}
          busy={busy}
          operate={operate}
          onError={onError}
          onClose={() => setDrawerOpen(false)}
          onOpenContent={onOpenContent}
          onInspect={setInspector}
        />
      ) : null}

      {creating ? (
        <CreateInstanceModal
          onClose={() => setCreating(false)}
          onError={onError}
          onCreated={async (created) => {
            await onRefresh();
            if (created?.id) { onSelect(created.id); setDrawerOpen(true); }
          }}
        />
      ) : null}

      {trashOpen ? (
        <TrashModal
          deleted={deleted}
          busy={busy}
          onClose={() => setTrashOpen(false)}
          onRestore={async (id) => {
            const restored = await operate('restore', () => bridge.instances.restore(id));
            if (restored?.id) onSelect(restored.id);
          }}
        />
      ) : null}

      {inspector && instance ? (
        <InspectorModal
          instance={instance}
          kind={inspector}
          busy={busy}
          operate={operate}
          session={session}
          onError={onError}
          onClose={() => setInspector(null)}
        />
      ) : null}
    </main>
  );
}
