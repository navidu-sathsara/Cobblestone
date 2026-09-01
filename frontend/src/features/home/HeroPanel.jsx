import { useCallback, useRef, useState } from 'react';
import { ChevronDown, Play, Plus, Square, User } from 'lucide-react';
import {
  bodyUrl, formatBuild, greeting,
} from '../../lib/format.js';
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
        <User size={80} strokeWidth={1.3} />
      </span>
    );
  }
  return (
    <img
      className="hero-skin"
      src={bodyUrl(username, 460)}
      alt=""
      draggable="false"
      onError={() => setFailed(true)}
    />
  );
}

function InstanceMenu({ instances, instance, onSelectInstance, onCreateDefault, close }) {
  return (
    <div className="picker-menu" role="menu" data-testid="launch-menu">
      <span className="picker-label">Launch target</span>

      {instances.map((item) => (
        <button
          type="button"
          role="menuitemradio"
          aria-checked={item.id === instance?.id}
          key={item.id}
          className={`picker-item${item.id === instance?.id ? ' picker-item--active' : ''}`}
          data-testid={`launch-option-${item.id}`}
          onClick={() => { onSelectInstance(item.id); close(); }}
        >
          <span className="picker-name">{item.name}</span>
          <span className="picker-meta">{formatBuild(item)}</span>
        </button>
      ))}

      {instances.length ? <div className="picker-divider" /> : null}

      <button
        type="button"
        role="menuitem"
        className="picker-item picker-item--action"
        data-testid="launch-menu-create"
        onClick={() => { onCreateDefault(); close(); }}
      >
        <Plus size={13} strokeWidth={2.8} />
        <span className="picker-name">New instance on latest release</span>
      </button>
    </div>
  );
}

/**
 * Cinematic play surface: environment at full bleed, player centered, launch
 * action anchored over the lower edge of the render.
 *
 * `heroImage` is an optional screenshot URL. Without it the backdrop is painted
 * in CSS, so no binary assets are required.
 */
export default function HeroPanel({
  username,
  accountType,
  instance,
  instances,
  session,
  onSelectInstance,
  onCreateDefault,
  creating = false,
  onRequireAccount,
  heroImage = null,
}) {
  const [open, setOpen] = useState(false);
  const holder = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(holder, open, close);

  const hasInstance = Boolean(instance);
  const busyLabel = BUSY_LABELS[session.status];
  const needsAccount = hasInstance && !username;
  const label = creating
    ? 'Creating…'
    : !hasInstance
      ? 'Create instance'
      : needsAccount
        ? 'Sign in to launch'
        : session.running
          ? 'Stop game'
          : busyLabel
            ? `${busyLabel}…`
            : 'Launch game';

  return (
    <section className="hero" data-testid="hero-panel">
      <div
        className={`hero-art${heroImage ? ' hero-art--custom' : ''}`}
        style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
        aria-hidden="true"
      />
      <div className="hero-atmosphere" aria-hidden="true" />

      <div className="hero-inner">
        <div className="hero-context">
          <span className="hero-eyebrow" data-testid="hero-greeting">
            {greeting()}
            {username ? `, ${username}` : ''}
            {accountType === 'offline' ? <span className="hero-eyebrow-tag">offline</span> : null}
          </span>
          <strong className="hero-title" data-testid="hero-instance-name">
            {instance?.name || 'Ready to explore'}
          </strong>
        </div>

        <div className="hero-stage">
          <span className="hero-nametag">{username || 'Player'}</span>
          <PlayerRender username={username} />
          <span className="hero-shadow" aria-hidden="true" />
        </div>

        <div className={`launch${session.busy ? ' launch--busy' : ''}`} ref={holder}>
          <button
            type="button"
            className="launch-main"
            disabled={session.busy || creating}
            data-testid="launch-button"
            onClick={() => {
              if (!hasInstance) onCreateDefault();
              else if (needsAccount) onRequireAccount();
              else session.toggle();
            }}
          >
            <span className="launch-glyph">
              {session.running ? <Square size={13} strokeWidth={3} /> : <Play size={14} strokeWidth={3} />}
            </span>
            <span className="launch-copy">
              <span className="launch-label">{label}</span>
              <span className="launch-build">{formatBuild(instance)}</span>
            </span>
          </button>

          <button
            type="button"
            className="launch-more"
            aria-label="Choose instance"
            aria-haspopup="menu"
            aria-expanded={open}
            data-testid="launch-menu-toggle"
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown size={16} strokeWidth={2.8} className={open ? 'launch-caret launch-caret--open' : 'launch-caret'} />
          </button>

          {open ? (
            <InstanceMenu
              instances={instances}
              instance={instance}
              onSelectInstance={onSelectInstance}
              onCreateDefault={onCreateDefault}
              close={close}
            />
          ) : null}
        </div>

        <span className="hero-status" data-testid="hero-status">
          {session.detail || (needsAccount
            ? 'Choose an account to launch'
            : hasInstance ? 'Ready to launch' : 'Create your first instance')}
        </span>
        {session.busy ? <span className="hero-progress" aria-hidden="true" /> : null}
      </div>
    </section>
  );
}
