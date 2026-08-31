import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDownToLine, CheckCircle2, Download, Image, Layers3,
  LoaderCircle, Package, PackageOpen, Pin, PinOff, Puzzle, RefreshCw,
  Search, Sparkles, Trash2, Upload,
} from 'lucide-react';
import { bridge, subscribe } from '../../lib/bridge.js';
import { formatCompact, formatLoader } from '../../lib/format.js';
import './ContentPage.css';

const TYPES = [
  { id: 'mod', label: 'Mods', folder: 'mods', Icon: Puzzle },
  { id: 'modpack', label: 'Modpacks', folder: null, Icon: Package },
  { id: 'resourcepack', label: 'Resources', folder: 'resourcepacks', Icon: Image },
  { id: 'shader', label: 'Shaders', folder: 'shaderpacks', Icon: Sparkles },
  { id: 'datapack', label: 'Data packs', folder: 'datapacks', Icon: Layers3 },
];

function ProjectArtwork({ item }) {
  const [failed, setFailed] = useState(false);
  if (!item.iconUrl || failed) {
    return <span className="content-project-art content-project-art--fallback"><Package size={22} /></span>;
  }
  return <img className="content-project-art" src={item.iconUrl} alt="" onError={() => setFailed(true)} />;
}

function ContentTypeTabs({ value, onChange }) {
  return (
    <div className="content-type-tabs" role="tablist" aria-label="Content type">
      {TYPES.map(({ id, label, Icon }) => (
        <button type="button" key={id} role="tab" aria-selected={value === id} className={value === id ? 'content-type-tab content-type-tab--active' : 'content-type-tab'} onClick={() => onChange(id)}>
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );
}

export default function ContentPage({ instances, instance, onSelect, onRefreshInstances, onError }) {
  const [view, setView] = useState('browse');
  const [type, setType] = useState('mod');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('relevance');
  const [result, setResult] = useState({ total: 0, items: [] });
  const [installed, setInstalled] = useState([]);
  const [updates, setUpdates] = useState({});
  const [verification, setVerification] = useState({});
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(null);
  const searchSequence = useRef(0);

  const refreshInstalled = useCallback(async () => {
    if (!instance) {
      setInstalled([]);
      return;
    }
    try {
      setInstalled(await bridge.mods.list(instance.id) || []);
    } catch (error) {
      onError(error.message);
    }
  }, [instance, onError]);

  useEffect(() => {
    refreshInstalled();
    const offInstall = subscribe('content:install', (event) => {
      if (event?.instanceId === instance?.id && event.status === 'completed') refreshInstalled();
    });
    const offRemove = subscribe('content:removed', (event) => {
      if (event?.instanceId === instance?.id) refreshInstalled();
    });
    return () => { offInstall(); offRemove(); };
  }, [instance?.id, refreshInstalled]);

  useEffect(() => {
    if (view !== 'browse') return undefined;
    const sequence = ++searchSequence.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const compatibility = instance ? {
          minecraftVersion: instance.minecraftVersion,
          loader: ['mod', 'modpack'].includes(type) ? instance.loader : undefined,
        } : {};
        const next = await bridge.providers.search('modrinth', {
          query: query.trim(), projectType: type, index: sort, limit: 36, ...compatibility,
        });
        if (sequence === searchSequence.current) setResult(next || { total: 0, items: [] });
      } catch (error) {
        if (sequence === searchSequence.current) onError(error.message);
      } finally {
        if (sequence === searchSequence.current) setSearching(false);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [instance?.id, instance?.loader, instance?.minecraftVersion, onError, query, sort, type, view]);

  const run = useCallback(async (key, operation, { refresh = true } = {}) => {
    if (busy) return null;
    setBusy(key);
    try {
      const value = await operation();
      if (refresh) await refreshInstalled();
      return value;
    } catch (error) {
      onError(error.message);
      return null;
    } finally {
      setBusy(null);
    }
  }, [busy, onError, refreshInstalled]);

  const installedKeys = useMemo(() => new Set(installed.map((item) => `${item.provider}:${item.projectId}`)), [installed]);
  const activeType = TYPES.find((item) => item.id === type) || TYPES[0];
  const filteredInstalled = useMemo(() => (
    activeType.folder ? installed.filter((item) => item.folder === activeType.folder) : []
  ), [activeType.folder, installed]);

  const installProject = async (project) => {
    if (project.projectType === 'modpack') {
      const created = await run(`project:${project.projectId}`, () => bridge.modpacks.installProvider({
        provider: 'modrinth', projectId: project.projectId, name: project.title,
      }), { refresh: false });
      if (created) {
        await onRefreshInstances();
        onSelect(created.id);
      }
      return;
    }
    if (!instance) {
      onError('Choose or create an instance before installing content');
      return;
    }
    await run(`project:${project.projectId}`, () => bridge.mods.install(instance.id, {
      provider: 'modrinth', projectId: project.projectId,
    }));
  };

  const importLocal = async () => {
    if (type === 'modpack') {
      const archive = await bridge.files.pickModpack().catch((error) => { onError(error.message); return null; });
      if (!archive) return;
      const created = await run('import-pack', () => bridge.modpacks.installArchive(archive, {}), { refresh: false });
      if (created) {
        await onRefreshInstances();
        onSelect(created.id);
      }
      return;
    }
    if (!instance) {
      onError('Choose an instance before importing content');
      return;
    }
    const source = await bridge.files.pickContent(activeType.folder).catch((error) => { onError(error.message); return null; });
    if (!source) return;
    await run('import-local', () => bridge.mods.importLocal(instance.id, source, { folder: activeType.folder }));
  };

  const checkUpdates = async () => {
    if (!instance) return;
    const values = await run('check-updates', () => bridge.mods.updates(instance.id), { refresh: false });
    if (values) setUpdates(Object.fromEntries(values.map((item) => [item.entry.key, item])));
  };

  const verify = async () => {
    if (!instance) return;
    const values = await run('verify', () => bridge.mods.verify(instance.id), { refresh: false });
    if (values) setVerification(Object.fromEntries(values.map((item) => [item.key, item])));
  };

  const updateAll = async () => {
    if (!instance) return;
    const values = await run('update-all', () => bridge.mods.updateAll(instance.id));
    if (values) {
      setUpdates({});
      const failures = values.filter((item) => !item.ok);
      if (failures.length) onError(`${failures.length} content update${failures.length === 1 ? '' : 's'} failed`);
    }
  };

  const updateCount = Object.values(updates).filter((item) => item.available).length;

  return (
    <main className="library-page content-page scroll-thin" data-testid="content-page">
      <header className="library-page-head content-page-head">
        <span><small>Powered by Modrinth</small><h1>Content</h1><p>Discover compatible projects and control everything installed locally.</p></span>
        <label className="content-instance-picker">
          <span>Install to</span>
          <select value={instance?.id || ''} onChange={(event) => onSelect(event.target.value)}>
            {!instances.length ? <option value="">No instances</option> : null}
            {instances.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatLoader(item.loader)} {item.minecraftVersion}</option>)}
          </select>
        </label>
      </header>

      <div className="content-toolbar">
        <div className="content-view-tabs">
          <button type="button" className={view === 'browse' ? 'content-view-tab content-view-tab--active' : 'content-view-tab'} onClick={() => setView('browse')}><Search size={14} /> Browse</button>
          <button type="button" className={view === 'installed' ? 'content-view-tab content-view-tab--active' : 'content-view-tab'} onClick={() => setView('installed')}><PackageOpen size={14} /> Installed <span>{installed.length}</span></button>
        </div>
        <button type="button" className="library-button library-button--secondary" disabled={Boolean(busy)} onClick={importLocal}>
          {busy === 'import-local' || busy === 'import-pack' ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}
          Import {type === 'modpack' ? 'modpack' : 'file'}
        </button>
      </div>

      <ContentTypeTabs value={type} onChange={setType} />

      {view === 'browse' ? (
        <section className="content-browser">
          <label className="content-search">
            {searching ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeType.label.toLowerCase()}…`} />
            <span>{formatCompact(result.total)} projects</span>
            <select value={sort} aria-label="Sort projects" onChange={(event) => setSort(event.target.value)}>
              <option value="relevance">Relevance</option>
              <option value="downloads">Downloads</option>
              <option value="follows">Followers</option>
              <option value="updated">Recently updated</option>
              <option value="newest">Newest</option>
            </select>
          </label>

          {!instance && type !== 'modpack' ? (
            <div className="content-context-warning"><AlertTriangle size={15} /> Create or choose an instance to filter compatibility and install projects.</div>
          ) : null}
          {instance?.loader === 'vanilla' && type === 'mod' ? (
            <div className="content-context-warning"><AlertTriangle size={15} /> This is a Vanilla instance. Choose Fabric, Forge, NeoForge, or Quilt to install mods.</div>
          ) : null}

          <div className="content-project-grid">
            {result.items.map((item) => {
              const key = `${item.provider}:${item.projectId}`;
              const present = installedKeys.has(key);
              const blocked = type !== 'modpack' && (!instance || (type === 'mod' && instance.loader === 'vanilla'));
              return (
                <article className="content-project" key={key}>
                  <ProjectArtwork item={item} />
                  <span className="content-project-copy">
                    <strong>{item.title}</strong>
                    <small>by {item.author} · {formatCompact(item.downloads)} downloads</small>
                    <p>{item.description}</p>
                    <span className="content-project-tags">{item.categories.slice(0, 3).map((category) => <i key={category}>{category}</i>)}</span>
                  </span>
                  <button
                    type="button"
                    className={present ? 'content-install content-install--installed' : 'content-install'}
                    disabled={Boolean(busy) || present || blocked}
                    title={blocked ? 'Choose a compatible instance first' : undefined}
                    onClick={() => installProject(item)}
                  >
                    {busy === `project:${item.projectId}` ? <LoaderCircle className="spin" size={14} /> : present ? <CheckCircle2 size={14} /> : <Download size={14} />}
                    {present ? 'Installed' : blocked ? 'Unavailable' : type === 'modpack' ? 'Create' : 'Install'}
                  </button>
                </article>
              );
            })}
          </div>
          {!searching && !result.items.length ? <div className="library-empty"><Search size={28} /><h2>No projects found</h2><p>Try another search or content type.</p></div> : null}
        </section>
      ) : (
        <section className="installed-content">
          <header className="installed-actions">
            <span><strong>{activeType.label}</strong><small>{filteredInstalled.length} installed in {instance?.name || 'no instance selected'}</small></span>
            <div>
              <button type="button" className="library-button library-button--secondary" disabled={!instance || Boolean(busy)} onClick={verify}>{busy === 'verify' ? <LoaderCircle className="spin" size={14} /> : <CheckCircle2 size={14} />} Verify</button>
              <button type="button" className="library-button library-button--secondary" disabled={!instance || Boolean(busy)} onClick={checkUpdates}>{busy === 'check-updates' ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} Check updates</button>
              {updateCount ? <button type="button" className="library-button library-button--primary" disabled={Boolean(busy)} onClick={updateAll}><ArrowDownToLine size={14} /> Update all ({updateCount})</button> : null}
            </div>
          </header>

          {type === 'modpack' ? (
            <div className="library-empty"><Package size={28} /><h2>Modpacks create instances</h2><p>Browse Modpacks to install a pack as its own isolated instance.</p><button type="button" className="library-button library-button--primary" onClick={() => setView('browse')}>Browse modpacks</button></div>
          ) : filteredInstalled.length ? (
            <div className="installed-list">
              {filteredInstalled.map((entry) => {
                const update = updates[entry.key];
                const checked = verification[entry.key];
                return (
                  <article className={`installed-row${entry.enabled ? '' : ' installed-row--disabled'}`} key={entry.key}>
                    <span className="installed-row-icon"><Package size={17} /></span>
                    <span className="installed-row-copy"><strong>{entry.title}</strong><small>{entry.versionNumber || 'Local file'} · {entry.filename}</small></span>
                    {update?.available ? <span className="installed-badge installed-badge--update">Update</span> : null}
                    {checked ? <span className={checked.valid ? 'installed-badge installed-badge--valid' : 'installed-badge installed-badge--bad'}>{checked.valid ? 'Verified' : checked.reason}</span> : null}
                    <button type="button" className={entry.enabled ? 'installed-toggle installed-toggle--on' : 'installed-toggle'} disabled={Boolean(busy)} aria-label={entry.enabled ? `Disable ${entry.title}` : `Enable ${entry.title}`} onClick={() => run(`toggle:${entry.key}`, () => bridge.mods.setEnabled(instance.id, entry.key, !entry.enabled))}><span /></button>
                    <button type="button" className="installed-icon-action" disabled={Boolean(busy) || entry.provider === 'local'} aria-label={entry.pinned ? `Unpin ${entry.title}` : `Pin ${entry.title}`} onClick={() => run(`pin:${entry.key}`, () => bridge.mods.setPinned(instance.id, entry.key, !entry.pinned))}>{entry.pinned ? <Pin size={15} fill="currentColor" /> : <PinOff size={15} />}</button>
                    <button type="button" className="installed-icon-action installed-icon-action--danger" disabled={Boolean(busy)} aria-label={`Remove ${entry.title}`} onClick={() => run(`remove:${entry.key}`, () => bridge.mods.remove(instance.id, entry.key))}>{busy === `remove:${entry.key}` ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}</button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="library-empty"><PackageOpen size={28} /><h2>No {activeType.label.toLowerCase()} installed</h2><p>Browse compatible Modrinth projects or import a local file.</p><button type="button" className="library-button library-button--primary" onClick={() => setView('browse')}>Browse {activeType.label.toLowerCase()}</button></div>
          )}
        </section>
      )}
    </main>
  );
}
