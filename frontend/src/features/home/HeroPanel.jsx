import { useCallback, useRef, useState } from 'react';
import { ChevronUp, Clock, Layers, Play, Plus, Square, User } from 'lucide-react';
import {
  bodyUrl, formatBuild, formatInstallState, formatPlaytime, formatRelative, greeting,
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
 * The play surface. Left column carries the identity of what is about to run,
 * the right column the active player's body render.
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

  const lastPlayed = formatRelative(instance?.lastPlayedAt);

  return (
    <section className="hero rise" data-testid="hero-panel">
      <div className="hero-sky" aria-hidden="true" />
      {heroImage ? (
        <div className="hero-photo" style={{ backgroundImage: `url(${heroImage})` }} aria-hidden="true" />
      ) : null}
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-fade" aria-hidden="true" />

      <div className="hero-inner">
        <div className="hero-copy">
          <span className="hero-eyebrow" data-testid="hero-greeting">
            {greeting()}
            {username ? `, ${username}` : ''}
            {accountType === 'offline' ? <span className="hero-eyebrow-tag">offline</span> : null}
          </span>

          <h1 className="hero-title" data-testid="hero-instance-name">
            {instance?.name || 'No instance yet'}
          </h1>

          <div className="hero-chips">
            <span className={`chip${instance?.installState === 'broken' ? ' chip--warn' : ' chip--accent'}`}>
              <Layers size={11} strokeWidth={2.6} />
              {instance ? formatInstallState(instance.installState) : 'Nothing installed'}
            </span>
            <span className="chip">{formatBuild(instance)}</span>
            <span className="chip">
              <Clock size={11} strokeWidth={2.6} />
              {instance ? formatPlaytime(instance.playTimeSeconds) : '—'}
            </span>
            {lastPlayed ? <span className="chip">Last played {lastPlayed}</span> : null}
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
              <span className="launch-label">{label}</span>
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
              <ChevronUp size={16} strokeWidth={2.8} className={open ? 'launch-caret launch-caret--open' : 'launch-caret'} />
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
              ? 'Choose a Microsoft account or offline profile first'
              : hasInstance ? 'Ready when you are' : 'Create an instance to get started')}
          </span>

          {session.busy ? <span className="hero-progress" aria-hidden="true" /> : null}
        </div>

        <div className="hero-stage">
          <span className="hero-nametag">{username || 'Player'}</span>
          <PlayerRender username={username} />
          <span className="hero-shadow" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
