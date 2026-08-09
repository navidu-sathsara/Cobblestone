import { useEffect, useState } from 'react';
import { Download, ChevronDown, Check, Boxes, Square, AlertTriangle, Play, Loader2 } from 'lucide-react';
import { useClickOutside } from '../../components/ui/Dropdown.jsx';
import { LOADER_ICONS } from '../../lib/cfApi.js';
import GlowPanel from '../../components/ui/GlowPanel.jsx';
import useLauncher from '../launcher/useLauncher.js';
import './HeroBanner.css';

const STATUS_TITLES = {
  preparing:   'Preparing',
  downloading: 'Downloading',
  launching:   'Starting',
  running:     'Running'
};

/** True when the MC version jar is present on disk. Falls back to true in the browser. */
function useIsInstalled(version) {
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    if (!version) return;
    const api = window.native?.instance;
    if (!api) return;
    api.isInstalled(version).then(setInstalled).catch(() => setInstalled(true));
  }, [version]);

  return installed;
}

export default function HeroBanner({
  store,
  account,
  onManageInstances   = () => {},
  autoLaunch          = false,
  onAutoLaunchDone    = () => {}
}) {
  const { instances, selected, select, update } = store;
  const [open, setOpen] = useState(false);
  const menuRef = useClickOutside(() => setOpen(false));
  const { status, detail, percent, launch, kill, busy } = useLauncher();
  const iconSrc = selected?.icon ?? LOADER_ICONS[selected?.loader] ?? null;
  const installed = useIsInstalled(selected?.version);

  const handleLaunch = () => {
    if (!selected || busy) return;
    update(selected.id, { lastPlayed: Date.now() });
    launch(selected, account);
  };

  useEffect(() => {
    if (autoLaunch && selected && !busy) {
      onAutoLaunchDone();
      handleLaunch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLaunch]);

  const isRunning = status === 'running' || status === 'launching';
  const showInstall = !installed && !busy;
  const isError = status === 'error';
  const showProgress = ['preparing', 'downloading', 'launching'].includes(status);

  const title = STATUS_TITLES[status]
    ?? (showInstall ? 'Install' : selected ? `Launch ${selected.version}` : 'Select Instance');

  const sub = isError ? (
    <><AlertTriangle size={11} /> {detail}</>
  ) : busy ? (
    <>{detail || '…'}</>
  ) : showInstall ? (
    <>{selected ? 'Game files required' : '…'}</>
  ) : (
    <>{selected ? <><Play size={9} fill="currentColor" /> Ready to launch</> : 'No instance selected'}</>
  );

  return (
    <GlowPanel className="hero">
      <div className="hero-body">
        <div
          className={`launch-wrap${showInstall ? ' launch-wrap--install' : ''}${isError ? ' launch-wrap--error' : ''}${busy ? ' launch-wrap--busy' : ''}`}
          ref={menuRef}
        >
          <div className="launch-glow" />
          <button
            className="launch-btn"
            title={showInstall ? 'Install game' : 'Launch'}
            disabled={busy}
            onClick={handleLaunch}
          >
            <span className="launch-icon" aria-hidden="true">
              {isRunning
                ? <Loader2 size={22} className="launch-spin" />
                : iconSrc
                  ? <img src={iconSrc} alt="" className="launch-icon-img" />
                  : null}
            </span>
            <span className="launch-text">
              <span className="launch-title">{title}</span>
              <span className="launch-sub">{sub}</span>
            </span>
          </button>

          {!isRunning && (
            <button
              className="launch-picker"
              title="Choose instance"
              disabled={busy}
              onClick={() => setOpen((v) => !v)}
            >
              <ChevronDown size={18} className={`launch-chevron${open ? ' open' : ''}`} />
            </button>
          )}
          {isRunning && (
            <button className="launch-picker launch-picker--stop" title="Stop game" onClick={kill}>
              <Square size={16} fill="currentColor" />
            </button>
          )}

          {open && (
            <div className="launch-menu">
              {instances.length === 0 ? (
                <div className="launch-menu-empty">No instances yet</div>
              ) : (
                instances.map((instance) => (
                  <button
                    key={instance.id}
                    className={`launch-menu-item${selected?.id === instance.id ? ' selected' : ''}`}
                    onClick={() => { select(instance.id); setOpen(false); }}
                  >
                    {instance.icon
                      ? <img className="launch-menu-icon" src={instance.icon} alt="" />
                      : LOADER_ICONS[instance.loader]
                        ? <img className="launch-menu-icon" src={LOADER_ICONS[instance.loader]} alt={instance.loader} />
                        : <span className="launch-menu-icon" style={{ background: instance.color }} />}
                    <span className="launch-menu-info">
                      <strong>{instance.name}</strong>
                      <small>{instance.loader} · {instance.version}</small>
                    </span>
                    {selected?.id === instance.id && <Check size={15} />}
                  </button>
                ))
              )}

              <div className="launch-menu-sep" />

              <button
                className="launch-menu-item launch-menu-manage"
                onClick={() => { setOpen(false); onManageInstances(); }}
              >
                <Boxes size={15} />
                <span>Manage Instances</span>
              </button>
            </div>
          )}
        </div>

        <div className={`hero-progress${showProgress ? '' : ' hero-progress--hidden'}`}>
          <div className="hero-progress-meta">
            <span>{detail || STATUS_TITLES[status] || 'Preparing Minecraft…'}</span>
            <strong>{status === 'downloading' ? `${percent}%` : 'Working'}</strong>
          </div>
          <div className="hero-progress-track">
            <div
              className={`hero-progress-fill${status === 'downloading' ? '' : ' indeterminate'}`}
              style={status === 'downloading' ? { width: `${percent}%` } : undefined}
            />
          </div>
        </div>
      </div>
    </GlowPanel>
  );
}
