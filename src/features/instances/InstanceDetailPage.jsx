import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Box, Gamepad2, Puzzle, Clock, Play, Square,
  Settings, Trash2, Search, Compass, Loader2, PackageOpen,
  FolderOpen, Globe, ScrollText, ChevronRight, Folder, File,
  ExternalLink, RefreshCw, Earth, Eraser, Terminal, Download
} from 'lucide-react';
import useLauncher from '../launcher/useLauncher.js';
import useInstalledMods from '../mods/useInstalledMods.js';
import useSettings from '../settings/useSettings.js';
import useIsInstalled from './useIsInstalled.js';
import InstanceModal from './InstanceModal.jsx';
import { timeAgo } from '../../lib/time.js';
import { LOADER_ICONS } from '../../lib/cfApi.js';
import { hydrateInstalledProjects } from '../../lib/contentApi.js';
import './InstanceDetailPage.css';

const TABS = [
  { id: 'content', label: 'Content', icon: PackageOpen },
  { id: 'files',   label: 'Files',   icon: FolderOpen  },
  { id: 'worlds',  label: 'Worlds',  icon: Globe       },
  { id: 'logs',    label: 'Logs',    icon: ScrollText  }
];

function fmtSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

/* ═══════════════════════════════════════════════════════════════
   FILES TAB — navigate the instance game directory
═══════════════════════════════════════════════════════════════ */
function FilesTab({ instanceId }) {
  const [crumbs, setCrumbs] = useState([]);
  const [entries, setEntries] = useState(null);

  const subpath = crumbs.join('/');

  useEffect(() => {
    setEntries(null);
    const api = window.native?.instance;
    if (!api) { setEntries([]); return; }
    api.listDir(instanceId, subpath)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [instanceId, subpath]);

  const navigate = (name) => setCrumbs((p) => [...p, name]);
  const navTo    = (idx)  => setCrumbs((p) => p.slice(0, idx));

  const openInExplorer = () =>
    window.native?.instance?.openFolder(instanceId, subpath);

  return (
    <>
      {/* breadcrumb bar */}
      <div className="inst-files-bar">
        <nav className="inst-breadcrumb">
          <button
            className={`inst-crumb${crumbs.length === 0 ? ' inst-crumb--active' : ''}`}
            onClick={() => navTo(0)}
          >
            Instance
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="inst-crumb-seg">
              <ChevronRight size={12} />
              <button
                className={`inst-crumb${i === crumbs.length - 1 ? ' inst-crumb--active' : ''}`}
                onClick={() => navTo(i + 1)}
              >
                {c}
              </button>
            </span>
          ))}
        </nav>
        <button className="icon-btn" title="Open folder in Explorer" onClick={openInExplorer}>
          <ExternalLink size={15} />
        </button>
      </div>

      <div className="inst-detail-body">
        {entries === null ? (
          <div className="mods-status">
            <Loader2 size={22} className="spin" /> Loading…
          </div>
        ) : entries.length === 0 && crumbs.length === 0 ? (
          <div className="mods-status">
            <FolderOpen size={26} />
            Instance folder is empty — launch once to populate it.
          </div>
        ) : (
          <div className="inst-mod-table">
            {/* header */}
            <div className="inst-file-row inst-file-head">
              <span>Name</span>
              <span>Size</span>
              <span>Modified</span>
            </div>

            {/* up-dir row */}
            {crumbs.length > 0 && (
              <div
                className="inst-file-row inst-file-updir"
                onClick={() => navTo(crumbs.length - 1)}
              >
                <span className="inst-file-name">
                  <Folder size={15} className="inst-icon-dir" />
                  ..
                </span>
                <span />
                <span />
              </div>
            )}

            {/* entries */}
            {entries.map((e) => (
              <div
                key={e.name}
                className={`inst-file-row${e.isDir ? ' inst-file-row--dir' : ''}`}
                onClick={e.isDir ? () => navigate(e.name) : undefined}
              >
                <span className="inst-file-name">
                  {e.isDir
                    ? <Folder size={15} className="inst-icon-dir" />
                    : <File   size={15} className="inst-icon-file" />}
                  <span className="inst-file-label">{e.name}</span>
                </span>
                <span className="inst-file-meta">
                  {e.isDir ? '—' : fmtSize(e.size)}
                </span>
                <span className="inst-file-meta">
                  {e.modified ? timeAgo(e.modified) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WORLDS TAB — list saves/ subdirectories
═══════════════════════════════════════════════════════════════ */
function WorldsTab({ instanceId }) {
  const [worlds, setWorlds] = useState(null);

  const load = () => {
    setWorlds(null);
    const api = window.native?.instance;
    if (!api) { setWorlds([]); return; }
    api.worldList(instanceId)
      .then(setWorlds)
      .catch(() => setWorlds([]));
  };

  useEffect(load, [instanceId]);

  const handleDelete = (name) => {
    if (!window.confirm(`Delete world "${name}"?\n\nThis is permanent and cannot be undone.`)) return;
    window.native?.instance?.deleteWorld(instanceId, name)
      .then(load)
      .catch(() => {});
  };

  const openSaves = () =>
    window.native?.instance?.openFolder(instanceId, 'saves');

  return (
    <>
      <div className="inst-files-bar">
        <span className="inst-bar-label">
          <Earth size={14} /> Saved Worlds
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="icon-btn" title="Refresh" onClick={load}>
            <RefreshCw size={15} />
          </button>
          <button className="icon-btn" title="Open saves folder" onClick={openSaves}>
            <ExternalLink size={15} />
          </button>
        </div>
      </div>

      <div className="inst-detail-body">
        {worlds === null ? (
          <div className="mods-status">
            <Loader2 size={22} className="spin" /> Loading worlds…
          </div>
        ) : worlds.length === 0 ? (
          <div className="mods-status">
            <Globe size={26} />
            No worlds found — launch the game and create one!
          </div>
        ) : (
          <div className="inst-mod-table">
            <div className="inst-world-row inst-world-head">
              <span>World</span>
              <span>Size</span>
              <span>Last Modified</span>
              <span className="inst-mod-actions-col">Actions</span>
            </div>
            {worlds.map((w) => (
              <div key={w.name} className="inst-world-row">
                <span className="inst-world-name">
                  <span className="inst-world-icon">
                    <Earth size={17} />
                  </span>
                  <span className="inst-world-label">{w.name}</span>
                </span>
                <span className="inst-file-meta">{fmtSize(w.sizeBytes)}</span>
                <span className="inst-file-meta">
                  {w.modified ? timeAgo(w.modified) : '—'}
                </span>
                <span className="inst-mod-actions-col">
                  <button
                    className="instance-btn instance-delete"
                    title="Delete world"
                    onClick={() => handleDelete(w.name)}
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LOGS TAB — live stream + load from disk
═══════════════════════════════════════════════════════════════ */
const MAX_LINES = 800;

function LogsTab({ instanceId }) {
  const [lines, setLines]           = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading]       = useState(false);
  const endRef                      = useRef(null);
  const bodyRef                     = useRef(null);

  // subscribe to live log events from the running game
  useEffect(() => {
    const api = window.native?.launcher;
    if (!api) return;
    const off = api.onLog((line) => {
      setLines((prev) => {
        const next = [...prev, String(line)];
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
      });
    });
    return off;
  }, []);

  // auto-scroll when new lines arrive
  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [lines, autoScroll]);

  const loadFromDisk = async () => {
    const api = window.native?.instance;
    if (!api) return;
    setLoading(true);
    try {
      const content = await api.getLogFile(instanceId);
      if (content) {
        setLines(content.split('\n').filter(Boolean));
      }
    } finally {
      setLoading(false);
    }
  };

  const lineClass = (line) => {
    if (/ERROR/i.test(line)) return 'log-error';
    if (/WARN/i.test(line))  return 'log-warn';
    return '';
  };

  return (
    <>
      <div className="inst-files-bar">
        <span className="inst-bar-label">
          <Terminal size={14} /> Game Log
          {lines.length > 0 && (
            <span className="inst-log-count">{lines.length} lines</span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="inst-log-toggle">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
          <button
            className="icon-btn"
            title="Load latest.log from disk"
            disabled={loading}
            onClick={loadFromDisk}
          >
            {loading
              ? <Loader2 size={15} className="spin" />
              : <RefreshCw size={15} />}
          </button>
          <button
            className="icon-btn"
            title="Clear log"
            onClick={() => setLines([])}
          >
            <Eraser size={15} />
          </button>
        </div>
      </div>

      <div className="inst-detail-body inst-log-body" ref={bodyRef}>
        {lines.length === 0 ? (
          <div className="mods-status">
            <ScrollText size={26} />
            No log output yet.
            <br />
            <button
              className="accent-btn"
              style={{ marginTop: 14 }}
              disabled={loading}
              onClick={loadFromDisk}
            >
              {loading
                ? <><Loader2 size={14} className="spin" /> Loading…</>
                : <><RefreshCw size={14} /> Load latest.log</>}
            </button>
          </div>
        ) : (
          <div className="inst-log-output">
            {lines.map((line, i) => (
              <div key={i} className={`inst-log-line ${lineClass(line)}`}>
                {line}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function InstanceDetailPage({
  store,
  account,
  instanceId,
  onBack       = () => {},
  onBrowseMods = () => {},
  onInstall    = () => {}
}) {
  const instance = store.instances.find((i) => i.id === instanceId);
  const { status, busy, launch, kill } = useLauncher();
  const { installed, remove } = useInstalledMods(instance);
  const { settings } = useSettings();
  const isInstalled = useIsInstalled(instance, status);

  const [tab,     setTab]     = useState('content');
  const [editing, setEditing] = useState(false);
  const [query,   setQuery]   = useState('');
  const [projects, setProjects] = useState(null);

  const modIds = Object.keys(installed);

  useEffect(() => {
    if (modIds.length === 0) { setProjects([]); return; }
    const controller = new AbortController();
    setProjects(null);
    hydrateInstalledProjects(installed, { signal: controller.signal })
      .then(setProjects)
      .catch((error) => { if (error.name !== 'AbortError') setProjects([]); });
    return () => controller.abort();
  }, [JSON.stringify(modIds)]);

  if (!instance) {
    return (
      <div className="inst-detail">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={15} /> Back to Instances
        </button>
        <div className="mods-status">Instance not found.</div>
      </div>
    );
  }

  const running = status === 'running' || status === 'launching';
  const needsInstall = !isInstalled && !busy;

  const handlePlay = () => {
    if (busy) return;
    store.select(instance.id);
    store.update(instance.id, { lastPlayed: Date.now() });
    launch(instance, account);
  };

  const handleInstall = () => {
    store.select(instance.id);
    onInstall();
  };

  const handleDelete = () => {
    const needsConfirm = settings?.behavior.confirmInstanceDelete !== false;
    if (
      needsConfirm &&
      !window.confirm(`Delete "${instance.name}"? Its worlds and mods stay on disk.`)
    ) return;
    store.remove(instance.id);
    onBack();
  };

  const shownMods = (projects ?? []).filter((p) =>
    p.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="inst-detail">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={15} /> Back to Instances
      </button>

      {/* ── header ── */}
      <header className="inst-detail-head">
        {instance.icon ? (
          <img className="inst-detail-icon inst-icon-img" src={instance.icon} alt="" />
        ) : LOADER_ICONS[instance.loader] ? (
          <img
            className="inst-detail-icon inst-detail-loader-img"
            src={LOADER_ICONS[instance.loader]}
            alt={`${instance.loader} logo`}
          />
        ) : (
          <span className="inst-detail-icon" style={{ background: instance.color }}>
            <Box size={38} />
          </span>
        )}

        <div className="inst-detail-info">
          <h1>{instance.name}</h1>
          <div className="inst-detail-meta">
            <span><Gamepad2 size={13} /> Minecraft {instance.version}</span>
            <span><Puzzle   size={13} /> {instance.loader}</span>
            <span><Clock    size={13} /> {timeAgo(instance.lastPlayed)}</span>
          </div>
        </div>

        <div className="inst-detail-actions">
          {running ? (
            <button className="accent-btn inst-play-btn inst-stop-btn" onClick={kill}>
              <Square size={14} fill="currentColor" /> Stop
            </button>
          ) : needsInstall ? (
            <button className="accent-btn inst-play-btn inst-install-btn" onClick={handleInstall}>
              <Download size={15} /> Install
            </button>
          ) : (
            <button className="accent-btn inst-play-btn" disabled={busy} onClick={handlePlay}>
              <Play size={15} fill="currentColor" /> Play
            </button>
          )}
          <button className="icon-btn" title="Edit instance" onClick={() => setEditing(true)}>
            <Settings size={16} />
          </button>
          <button className="icon-btn inst-delete-btn" title="Delete instance" onClick={handleDelete}>
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* ── tabs ── */}
      <div className="pill-tabs inst-detail-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`pill-tab${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── content tab ── */}
      {tab === 'content' && (
        <>
          <div className="inst-content-filters">
            <div className="search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder={`Search ${modIds.length} installed mod${modIds.length === 1 ? '' : 's'}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              className="accent-btn"
              onClick={() => { store.select(instance.id); onBrowseMods(); }}
            >
              <Compass size={15} /> Browse Content
            </button>
          </div>

          <div className="inst-detail-body">
            {projects === null ? (
              <div className="mods-status">
                <Loader2 size={22} className="spin" /> Loading content…
              </div>
            ) : shownMods.length === 0 ? (
              <div className="mods-status">
                <PackageOpen size={26} />
                {modIds.length === 0
                  ? 'Nothing installed yet — hit Browse Content.'
                  : 'No mods match.'}
              </div>
            ) : (
              <div className="inst-mod-table">
                <div className="inst-mod-row inst-mod-head">
                  <span>Project</span>
                  <span>File</span>
                  <span className="inst-mod-actions-col">Actions</span>
                </div>
                {shownMods.map((mod) => {
                  const entry    = installed[mod.id];
                  const filename = typeof entry === 'string' ? entry : entry?.filename;
                  const folder   = typeof entry === 'string' ? 'mods' : entry?.folder ?? 'mods';
                  return (
                    <div className="inst-mod-row" key={mod.id}>
                      <span className="inst-mod-project">
                        {mod.icon_url
                          ? <img src={mod.icon_url} alt="" loading="lazy" />
                          : <span className="inst-mod-fallback">{mod.title[0]}</span>}
                        <strong>{mod.title}</strong>
                      </span>
                      <span className="inst-mod-file">{`${folder}/${filename}`}</span>
                      <span className="inst-mod-actions-col">
                        <button
                          className="instance-btn instance-delete"
                          title="Remove"
                          onClick={() => remove(mod.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── files tab ── */}
      {tab === 'files' && <FilesTab instanceId={instance.id} />}

      {/* ── worlds tab ── */}
      {tab === 'worlds' && <WorldsTab instanceId={instance.id} />}

      {/* ── logs tab ── */}
      {tab === 'logs' && <LogsTab instanceId={instance.id} />}

      {editing && (
        <InstanceModal
          initial={instance}
          onClose={() => setEditing(false)}
          onSave={(values) => {
            store.update(instance.id, values);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
