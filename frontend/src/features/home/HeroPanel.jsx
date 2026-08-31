import { useCallback, useRef, useState } from 'react';
import { ChevronDown, Plus, User } from 'lucide-react';
import { bodyUrl, formatLaunchTarget, formatLoader } from '../../lib/format.js';
import { useDismiss } from '../../lib/use-dismiss.js';
import './HeroPanel.css';

const BUSY_LABELS = {
  preparing: 'Preparing',
  installing: 'Installing',
  launching: 'Launching',
  stopping: 'Stopping',
};

function PlayerRender({ username }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="hero-skin hero-skin--fallback">
        <User size={72} strokeWidth={1.4} />
      </span>
    );
  }
  return (
    <img
      className="hero-skin"
      src={bodyUrl(username, 420)}
      alt=""
      draggable="false"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * The play surface: a Minecraft-toned backdrop, the active player's body render
 * under their nametag, and the split launch control.
 *
 * `heroImage` is an optional screenshot URL. Without it the backdrop is painted
 * in CSS, which is what the shipped build does — no binary assets are required.
 */
export default function HeroPanel({
  username,
  instance,
  instances,
  session,
  onSelectInstance,
  onCreateDefault,
  heroImage = null,
}) {
  const [open, setOpen] = useState(false);
  const holder = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(holder, open, close);

  const hasInstance = Boolean(instance);
  const label = !hasInstance
    ? 'Create instance'
    : session.running
      ? 'Stop game'
      : BUSY_LABELS[session.status]
        ? `${BUSY_LABELS[session.status]}…`
        : 'Launch game';

  const subtitle = session.detail || formatLaunchTarget(instance);

  return (
    <section className="hero">
      <div className="hero-backdrop" aria-hidden="true" />
      {heroImage ? (
        <div className="hero-photo" style={{ backgroundImage: `url(${heroImage})` }} aria-hidden="true" />
      ) : null}
      <div className="hero-vignette" aria-hidden="true" />

      <div className="hero-stage">
        <span className="hero-nametag">{username || 'Player'}</span>
        <PlayerRender username={username} />

        <div className={`launch${session.busy ? ' launch--busy' : ''}`} ref={holder}>
          <button
            type="button"
            className="launch-main"
            disabled={session.busy}
            onClick={() => (hasInstance ? session.toggle() : onCreateDefault())}
          >
            <span className="launch-label">{label}</span>
            <span className="launch-subtitle">{subtitle}</span>
          </button>

          <button
            type="button"
            className="launch-more"
            aria-label="Choose instance"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown size={17} strokeWidth={2.6} />
          </button>

          {session.busy ? <span className="launch-progress" aria-hidden="true" /> : null}

          {open ? (
            <div className="launch-menu" role="menu">
              {instances.map((item) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.id === instance?.id}
                  key={item.id}
                  className={`launch-menu-item${item.id === instance?.id ? ' launch-menu-item--active' : ''}`}
                  onClick={() => { onSelectInstance(item.id); close(); }}
                >
                  <span className="launch-menu-name">{item.name}</span>
                  <span className="launch-menu-meta">
                    {formatLoader(item.loader)} {item.minecraftVersion}
                  </span>
                </button>
              ))}

              {instances.length ? <div className="launch-menu-divider" /> : null}

              <button
                type="button"
                role="menuitem"
                className="launch-menu-item launch-menu-item--action"
                onClick={() => { onCreateDefault(); close(); }}
              >
                <Plus size={13} strokeWidth={2.6} />
                <span className="launch-menu-name">New instance on latest release</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
