import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, Check, Clock3, Copy, FileText, FolderOpen, HardDrive, LoaderCircle,
  Map, Package, Play, Plus, RotateCcw, Settings2, Trash2, Wrench, X,
} from 'lucide-react';
import { bridge } from '../../lib/bridge.js';
import { formatBuild, formatInstallState, formatPlaytime, formatRelative } from '../../lib/format.js';
import './InstancesPage.css';

const LOADERS = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'];

function CreateInstanceModal({ onClose, onCreated, onError }) {
  const [versions, setVersions] = useState([]);
  const [loaderVersions, setLoaderVersions] = useState([]);
  const [name, setName] = useState('New instance');
  const [minecraftVersion, setMinecraftVersion] = useState('');
  const [loader, setLoader] = useState('fabric');
  const [loaderVersion, setLoaderVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    bridge.versions.list({ types: ['release', 'snapshot'], limit: 100 })
      .then((items) => {
        if (cancelled) return;
        setVersions(items || []);
        setMinecraftVersion(items?.[0]?.id || '');
      })
      .catch((error) => onError(error.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [onError]);

  useEffect(() => {
    if (!minecraftVersion || loader === 'vanilla') {
      setLoaderVersions([]);
      setLoaderVersion('');
      return undefined;
    }
    let cancelled = false;
    setLoaderVersion('');
    bridge.loaders.list(loader, minecraftVersion)
      .then((items) => {
        if (cancelled) return;
        setLoaderVersions(items || []);
        setLoaderVersion((items || []).find((item) => item.stable)?.version || items?.[0]?.version || '');
      })
      .catch((error) => { if (!cancelled) onError(error.message); });
    return () => { cancelled = true; };
  }, [loader, minecraftVersion, onError]);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim() || !minecraftVersion || saving) return;
    setSaving(true);
    try {
      const created = await bridge.instances.create({
        name: name.trim(), minecraftVersion, loader,
        loaderVersion: loader === 'vanilla' ? null : loaderVersion || null,
      });
      await onCreated(created);
      onClose();
    } catch (error) {
      onError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="library-modal-backdrop">
      <form className="library-modal" onSubmit={submit}>
        <header className="library-modal-head">
          <span><small>Instance builder</small><strong>Create an instance</strong></span>
          <button type="button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="library-form-grid">
          <label className="library-field library-field--wide">
            <span>Name</span>
            <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} autoFocus />
          </label>
          <label className="library-field">
            <span>Minecraft</span>
            <select
              value={minecraftVersion}
              disabled={loading}
              onChange={(event) => setMinecraftVersion(event.target.value)}
            >
              {versions.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.type}</option>)}
            </select>
          </label>
          <label className="library-field">
            <span>Loader</span>
            <select value={loader} onChange={(event) => setLoader(event.target.value)}>
              {LOADERS.map((item) => <option key={item} value={item}>{item === 'neoforge' ? 'NeoForge' : item[0].toUpperCase() + item.slice(1)}</option>)}
            </select>
          </label>
          {loader !== 'vanilla' ? (
            <label className="library-field library-field--wide">
              <span>Loader version</span>
              <select value={loaderVersion} onChange={(event) => setLoaderVersion(event.target.value)}>
                {!loaderVersions.length ? <option value="">Resolve recommended version automatically</option> : null}
                {loaderVersions.map((item) => (
                  <option key={item.version} value={item.version}>{item.version}{item.stable ? ' · stable' : ''}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <footer className="library-modal-actions">
          <button type="button" className="library-button library-button--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="library-button library-button--primary" disabled={saving || loading || !name.trim() || !minecraftVersion}>
            {saving ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}
            Create instance
          </button>
        </footer>
      </form>
    </div>
  );
}

export default function InstancesPage({
  instances, instance, session, onSelect, onRefresh, onError, onOpenContent,
}) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [deleted, setDeleted] = useState([]);
  const [inspector, setInspector] = useState(null);
  const [inspectorData, setInspectorData] = useState(null);
  const [name, setName] = useState(instance?.name || '');

  const refreshTrash = useCallback(() => (
    bridge.instances.deleted()
      .then((items) => setDeleted(items || []))
      .catch((error) => onError(error.message))
  ), [onError]);

  useEffect(() => { refreshTrash(); }, [refreshTrash]);

  useEffect(() => {
    setName(instance?.name || '');
    setDeleteArmed(false);
  }, [instance?.id, instance?.name]);

  const operate = useCallback(async (key, action, { selectId = null } = {}) => {
    if (busy) return null;
    setBusy(key);
    try {
      const result = await action();
      await onRefresh();
      await refreshTrash();
      if (selectId) onSelect(typeof selectId === 'function' ? selectId(result) : selectId);
      return result;
    } catch (error) {
      onError(error.message);
      return null;
    } finally {
      setBusy(null);
    }
  }, [busy, onError, onRefresh, onSelect, refreshTrash]);

  const recent = useMemo(() => formatRelative(instance?.lastPlayedAt), [instance?.lastPlayedAt]);

  const openInspector = async (kind) => {
    if (!instance) return;
    setInspector(kind);
    setInspectorData(null);
    try {
      if (kind === 'worlds') setInspectorData(await bridge.instances.worlds(instance.id));
      if (kind === 'logs') setInspectorData(await bridge.instances.readLog(instance.id, { lines: 800 }));
      if (kind === 'backups') setInspectorData(await bridge.backups.list(instance.id));
    } catch (error) {
      onError(error.message);
      setInspector(null);
    }
  };

  return (
    <main className="library-page scroll-thin" data-testid="instances-page">
      <header className="library-page-head">
        <span><small>Local library</small><h1>Instances</h1><p>Every Minecraft setup, isolated and ready to manage.</p></span>
        <div className="library-page-actions">
          <button type="button" className="library-button library-button--secondary" onClick={() => setTrashOpen(true)}>
            <Trash2 size={14} /> Trash{deleted.length ? ` (${deleted.length})` : ''}
          </button>
          <button type="button" className="library-button library-button--primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> New instance
          </button>
        </div>
      </header>

      <div className="instances-workspace">
        <aside className="instance-library scroll-thin">
          {instances.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`instance-library-row${item.id === instance?.id ? ' instance-library-row--active' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <span className="instance-library-icon">{item.managedPack ? <Package size={18} /> : item.name.slice(0, 1).toUpperCase()}</span>
              <span><strong>{item.name}</strong><small>{formatBuild(item)}</small></span>
              {item.id === instance?.id ? <Check size={14} /> : null}
            </button>
          ))}
          {!instances.length ? (
            <div className="library-empty library-empty--compact"><Package size={22} /><strong>No instances yet</strong><small>Create one to begin.</small></div>
          ) : null}
        </aside>

        {instance ? (
          <section className="instance-detail">
            <div className="instance-detail-hero">
              <span className="instance-detail-mark">{instance.managedPack ? <Package size={28} /> : instance.name.slice(0, 1).toUpperCase()}</span>
              <span className="instance-detail-title">
                <small>{instance.managedPack ? 'Managed modpack' : 'Custom instance'}</small>
                <h2>{instance.name}</h2>
                <p>{formatBuild(instance)}{instance.loaderVersion ? ` · ${instance.loaderVersion}` : ''}</p>
              </span>
              <button
                type="button"
                className="library-button library-button--primary"
                disabled={Boolean(busy) || session.busy}
                onClick={() => session.running ? session.stop() : session.launch()}
              >
                {session.busy ? <LoaderCircle className="spin" size={15} /> : <Play size={15} fill="currentColor" />}
                {session.running ? 'Stop game' : session.busy ? 'Working…' : 'Play'}
              </button>
            </div>

            <div className="instance-stat-grid">
              <span><Clock3 size={15} /><small>Play time</small><strong>{formatPlaytime(instance.playTimeSeconds)}</strong></span>
              <span><HardDrive size={15} /><small>Installation</small><strong>{formatInstallState(instance.installState)}</strong></span>
              <span><Settings2 size={15} /><small>Last played</small><strong>{recent || 'Never'}</strong></span>
            </div>

            <section className="instance-section">
              <header><span><small>Configuration</small><h3>Instance settings</h3></span></header>
              <div className="instance-setting-row">
                <label className="library-field">
                  <span>Display name</span>
                  <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
                </label>
                <button
                  type="button"
                  className="library-button library-button--secondary"
                  disabled={!name.trim() || name.trim() === instance.name || Boolean(busy)}
                  onClick={() => operate('rename', () => bridge.instances.update(instance.id, { name: name.trim() }))}
                >
                  {busy === 'rename' ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Save
                </button>
              </div>
            </section>

            <section className="instance-section">
              <header><span><small>Tools</small><h3>Manage this instance</h3></span></header>
              <div className="instance-tool-grid">
                <button type="button" onClick={onOpenContent}><Package size={17} /><span><strong>Manage content</strong><small>Mods, packs, shaders and updates</small></span></button>
                <button type="button" onClick={() => bridge.instances.openFolder(instance.id).catch((error) => onError(error.message))}><FolderOpen size={17} /><span><strong>Open folder</strong><small>Browse game files in Explorer</small></span></button>
                <button type="button" disabled={Boolean(busy)} onClick={() => operate('duplicate', () => bridge.instances.duplicate(instance.id), { selectId: (copy) => copy?.id })}><Copy size={17} /><span><strong>Duplicate</strong><small>Copy settings, worlds and content</small></span></button>
                <button type="button" disabled={Boolean(busy)} onClick={() => operate('repair', () => bridge.installation.repair(instance.id))}><Wrench size={17} /><span><strong>Repair</strong><small>Verify and restore game files</small></span></button>
                <button type="button" onClick={() => openInspector('worlds')}><Map size={17} /><span><strong>Worlds</strong><small>Review local saves and sizes</small></span></button>
                <button type="button" onClick={() => openInspector('logs')}><FileText size={17} /><span><strong>Latest log</strong><small>Inspect the current game log</small></span></button>
                <button type="button" onClick={() => openInspector('backups')}><Archive size={17} /><span><strong>Backups</strong><small>Create or restore snapshots</small></span></button>
              </div>
            </section>

            <section className="instance-danger">
              <span><strong>Move instance to trash</strong><small>Worlds and files remain recoverable in launcher storage.</small></span>
              {deleteArmed ? (
                <span className="instance-delete-confirm">
                  <button type="button" onClick={() => setDeleteArmed(false)}>Cancel</button>
                  <button
                    type="button"
                    disabled={Boolean(busy) || session.running}
                    onClick={() => operate('delete', () => bridge.instances.delete(instance.id))}
                  >Delete instance</button>
                </span>
              ) : (
                <button type="button" disabled={session.running} onClick={() => setDeleteArmed(true)}><Trash2 size={14} /> Trash</button>
              )}
            </section>
          </section>
        ) : (
          <section className="library-empty"><Package size={32} /><h2>Build your first instance</h2><p>Choose a Minecraft version and loader, then add content from Modrinth.</p><button type="button" className="library-button library-button--primary" onClick={() => setCreating(true)}><Plus size={15} /> Create instance</button></section>
        )}
      </div>

      {creating ? (
        <CreateInstanceModal
          onClose={() => setCreating(false)}
          onError={onError}
          onCreated={async (created) => { await onRefresh(); if (created?.id) onSelect(created.id); }}
        />
      ) : null}

      {trashOpen ? (
        <div className="library-modal-backdrop">
          <section className="library-modal library-trash-modal" role="dialog" aria-modal="true" aria-label="Deleted instances">
            <header className="library-modal-head">
              <span><small>Recoverable storage</small><strong>Instance trash</strong></span>
              <button type="button" aria-label="Close" onClick={() => setTrashOpen(false)}><X size={16} /></button>
            </header>
            <div className="library-trash-list">
              {deleted.map((record) => (
                <div className="library-trash-row" key={record.instance.id}>
                  <span className="instance-library-icon">{record.instance.name.slice(0, 1).toUpperCase()}</span>
                  <span><strong>{record.instance.name}</strong><small>{formatBuild(record.instance)} · deleted {formatRelative(record.deletedAt)}</small></span>
                  <button
                    type="button"
                    className="library-button library-button--secondary"
                    disabled={Boolean(busy)}
                    onClick={async () => {
                      const restored = await operate('restore', () => bridge.instances.restore(record.instance.id));
                      if (restored?.id) onSelect(restored.id);
                    }}
                  >
                    {busy === 'restore' ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />} Restore
                  </button>
                </div>
              ))}
              {!deleted.length ? <div className="library-empty library-empty--compact"><Trash2 size={22} /><strong>Trash is empty</strong><small>Deleted instances will appear here.</small></div> : null}
            </div>
          </section>
        </div>
      ) : null}

      {inspector ? (
        <div className="library-modal-backdrop">
          <section className="library-modal library-inspector-modal" role="dialog" aria-modal="true" aria-label={`${inspector} for ${instance?.name}`}>
            <header className="library-modal-head">
              <span><small>{instance?.name}</small><strong>{inspector === 'worlds' ? 'Worlds' : inspector === 'logs' ? 'Latest log' : 'Backups'}</strong></span>
              <button type="button" aria-label="Close" onClick={() => setInspector(null)}><X size={16} /></button>
            </header>
            <div className="library-inspector-body scroll-thin">
              {inspectorData === null ? <div className="library-empty library-empty--compact"><LoaderCircle className="spin" size={22} /><strong>Loading…</strong></div> : null}
              {inspector === 'worlds' && Array.isArray(inspectorData) ? inspectorData.map((world) => (
                <div className="library-data-row" key={world.name}><Map size={16} /><span><strong>{world.name}</strong><small>{world.size ? `${Math.max(1, Math.round(world.size / 1024 / 1024))} MB` : 'Size unavailable'} · modified {formatRelative(world.modifiedAt)}</small></span></div>
              )) : null}
              {inspector === 'worlds' && Array.isArray(inspectorData) && !inspectorData.length ? <div className="library-empty library-empty--compact"><Map size={22} /><strong>No worlds found</strong></div> : null}
              {inspector === 'logs' && inspectorData !== null ? <pre className="library-log">{inspectorData || 'No latest.log has been created yet.'}</pre> : null}
              {inspector === 'backups' && Array.isArray(inspectorData) ? (
                <>
                  <button
                    type="button"
                    className="library-button library-button--primary library-backup-create"
                    disabled={Boolean(busy)}
                    onClick={async () => {
                      const created = await operate('backup', () => bridge.backups.create(instance.id, { kind: 'full', reason: 'manual' }));
                      if (created) setInspectorData(await bridge.backups.list(instance.id));
                    }}
                  >{busy === 'backup' ? <LoaderCircle className="spin" size={14} /> : <Archive size={14} />} Create full backup</button>
                  {inspectorData.map((backup) => (
                    <div className="library-data-row" key={backup.filename}>
                      <Archive size={16} />
                      <span><strong>{formatRelative(backup.createdAt) || 'Backup'}</strong><small>{Math.max(1, Math.round(backup.bytes / 1024 / 1024))} MB · {backup.filename}</small></span>
                      <button
                        type="button"
                        className="library-button library-button--secondary"
                        disabled={Boolean(busy) || session.running}
                        onClick={() => operate('restore-backup', () => bridge.backups.restore(backup.filename, { targetInstanceId: instance.id }))}
                      >{busy === 'restore-backup' ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />} Restore</button>
                    </div>
                  ))}
                  {!inspectorData.length ? <div className="library-empty library-empty--compact"><Archive size={22} /><strong>No backups yet</strong><small>Create a full snapshot before major changes.</small></div> : null}
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
