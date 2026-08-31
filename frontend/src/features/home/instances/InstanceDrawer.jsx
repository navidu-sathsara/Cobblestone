import { useEffect, useRef, useState } from 'react';
import {
  Archive, Check, Clock3, Copy, FileText, FolderOpen, HardDrive, LoaderCircle, Map,
  Package, Play, Siren, Square, Trash2, Wrench, X,
} from 'lucide-react';
import { bridge } from '../../../lib/bridge.js';
import {
  formatBuild, formatInstallState, formatLoader, formatPlaytime, formatRelative,
} from '../../../lib/format.js';

const TOOLS = [
  { id: 'content', label: 'Manage content', hint: 'Mods, packs, shaders, updates', Icon: Package },
  { id: 'folder', label: 'Open folder', hint: 'Browse the game files on disk', Icon: FolderOpen },
  { id: 'duplicate', label: 'Duplicate', hint: 'Copy settings, worlds and content', Icon: Copy },
  { id: 'repair', label: 'Repair', hint: 'Verify and restore game files', Icon: Wrench },
  { id: 'worlds', label: 'Worlds', hint: 'Review local saves and sizes', Icon: Map },
  { id: 'logs', label: 'Latest log', hint: 'Inspect the current game log', Icon: FileText },
  { id: 'backups', label: 'Backups', hint: 'Create or restore snapshots', Icon: Archive },
  { id: 'crashes', label: 'Crash reports', hint: 'Read the newest crash dumps', Icon: Siren },
];

/**
 * Everything that acts on a single instance. Lives in a drawer so the library
 * grid stays the page's primary surface and the panel can be dismissed with
 * Escape or a click on the veil.
 */
export default function InstanceDrawer({
  instance, session, busy, operate, onError, onClose, onOpenContent, onInspect,
}) {
  const [name, setName] = useState(instance.name);
  const [armed, setArmed] = useState(false);
  const panel = useRef(null);

  useEffect(() => {
    setName(instance.name);
    setArmed(false);
  }, [instance.id, instance.name]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tool = (id) => {
    if (id === 'content') return onOpenContent();
    if (id === 'folder') {
      return bridge.instances.openFolder(instance.id).catch((error) => onError(error.message));
    }
    if (id === 'duplicate') {
      return operate('duplicate', () => bridge.instances.duplicate(instance.id), { selectId: (copy) => copy?.id });
    }
    if (id === 'repair') return operate('repair', () => bridge.installation.repair(instance.id));
    return onInspect(id);
  };

  return (
    <>
      <div className="inst-drawer-veil" data-testid="instance-drawer-veil" onClick={onClose} />
      <section
        className="inst-drawer scroll-thin"
        role="dialog"
        aria-modal="false"
        aria-label={`${instance.name} settings`}
        tabIndex={-1}
        ref={panel}
        data-testid="instance-drawer"
      >
        <header className="inst-drawer-head">
          <span className="inst-drawer-mark" aria-hidden="true">
            {instance.managedPack ? <Package size={24} /> : instance.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="inst-drawer-title">
            <small>{instance.managedPack ? 'Managed modpack' : 'Custom instance'}</small>
            <h2 data-testid="instance-drawer-name">{instance.name}</h2>
            <p>{formatBuild(instance)}{instance.loaderVersion ? ` · ${instance.loaderVersion}` : ''}</p>
          </span>
          <button
            type="button"
            className="ui-modal-close"
            aria-label="Close instance settings"
            data-testid="instance-drawer-close"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="inst-drawer-cta">
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            disabled={Boolean(busy) || session.busy}
            data-testid="instance-drawer-play"
            onClick={() => (session.running ? session.stop() : session.launch())}
          >
            {session.busy
              ? <LoaderCircle className="ui-spin" size={15} />
              : session.running ? <Square size={13} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            {session.running ? 'Stop game' : session.busy ? 'Working…' : 'Play'}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--secondary"
            data-testid="instance-drawer-content"
            onClick={onOpenContent}
          >
            <Package size={15} /> Content
          </button>
        </div>

        <div className="inst-stats" data-testid="instance-drawer-stats">
          <span><Clock3 size={14} /><small>Play time</small><strong>{formatPlaytime(instance.playTimeSeconds)}</strong></span>
          <span><HardDrive size={14} /><small>Installation</small><strong>{formatInstallState(instance.installState)}</strong></span>
          <span><Play size={14} /><small>Last played</small><strong>{formatRelative(instance.lastPlayedAt) || 'Never'}</strong></span>
          <span><Package size={14} /><small>Loader</small><strong>{formatLoader(instance.loader)}</strong></span>
        </div>

        <section className="inst-drawer-section">
          <h3 className="eyebrow eyebrow--muted">Configuration</h3>
          <div className="inst-rename">
            <label className="ui-field">
              <span>Display name</span>
              <input
                value={name}
                maxLength={120}
                data-testid="instance-rename-input"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              disabled={!name.trim() || name.trim() === instance.name || Boolean(busy)}
              data-testid="instance-rename-save"
              onClick={() => operate('rename', () => bridge.instances.update(instance.id, { name: name.trim() }))}
            >
              {busy === 'rename' ? <LoaderCircle className="ui-spin" size={14} /> : <Check size={15} />} Save
            </button>
          </div>
        </section>

        <section className="inst-drawer-section">
          <h3 className="eyebrow eyebrow--muted">Tools</h3>
          <div className="inst-tools">
            {TOOLS.map(({ id, label, hint, Icon }) => (
              <button
                type="button"
                key={id}
                disabled={Boolean(busy) && ['duplicate', 'repair'].includes(id)}
                data-testid={`instance-tool-${id}`}
                onClick={() => tool(id)}
              >
                <Icon size={16} />
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
                {busy === id ? <LoaderCircle className="ui-spin" size={14} /> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="inst-danger">
          <span>
            <strong>Move instance to trash</strong>
            <small>Worlds and files stay recoverable in launcher storage.</small>
          </span>
          {armed ? (
            <span className="inst-danger-confirm">
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--sm"
                data-testid="instance-delete-cancel"
                onClick={() => setArmed(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--danger ui-btn--sm"
                disabled={Boolean(busy) || session.running}
                data-testid="instance-delete-confirm"
                onClick={() => operate('delete', () => bridge.instances.delete(instance.id), { closeDrawer: true })}
              >
                {busy === 'delete' ? <LoaderCircle className="ui-spin" size={14} /> : <Trash2 size={14} />} Delete
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="ui-btn ui-btn--danger ui-btn--sm"
              disabled={session.running}
              data-testid="instance-delete-arm"
              onClick={() => setArmed(true)}
            >
              <Trash2 size={14} /> Trash
            </button>
          )}
        </section>
      </section>
    </>
  );
}
