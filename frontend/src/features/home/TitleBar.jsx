import { useCallback, useRef, useState } from 'react';
import { Check, LogIn, Minus, Plus, Square, User, Users } from 'lucide-react';
import { bridge } from '../../lib/bridge.js';
import { headUrl } from '../../lib/format.js';
import { useDismiss } from '../../lib/use-dismiss.js';
import './TitleBar.css';

const OFFLINE_NAME = /^[A-Za-z0-9_]{1,16}$/;

const BUSY_LABELS = {
  preparing: 'Preparing',
  installing: 'Installing',
  launching: 'Launching',
  stopping: 'Stopping',
};

function Avatar({ name, size }) {
  const [failed, setFailed] = useState(false);
  if (!name || failed) {
    return (
      <span className="avatar avatar--fallback" style={{ width: size, height: size }}>
        <User size={Math.round(size * 0.6)} strokeWidth={2.2} />
      </span>
    );
  }
  return (
    <img
      className="avatar"
      style={{ width: size, height: size }}
      src={headUrl(name, size * 2)}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

/** Live session readout: what the launcher is doing right now, or nothing. */
function SessionChip({ session, instance }) {
  if (!instance) return null;
  const busy = BUSY_LABELS[session.status];
  if (!session.running && !busy) return null;

  return (
    <span className={`session-chip${session.running ? ' session-chip--live' : ''}`} data-testid="session-chip">
      <span className={`dot${session.running ? ' dot--online' : ' dot--idle'}`} />
      {session.running ? `Playing ${instance.name}` : `${busy}…`}
    </span>
  );
}

function AccountMenu({ accounts, active, onSelect, onAddOffline, onLoginMicrosoft, close }) {
  const [name, setName] = useState('');
  const valid = OFFLINE_NAME.test(name);

  const submit = (event) => {
    event.preventDefault();
    if (!valid) return;
    onAddOffline(name);
    setName('');
    close();
  };

  return (
    <div className="account-menu" role="menu" data-testid="account-menu">
      <span className="account-menu-label">Signed in</span>

      {accounts.length ? accounts.map((account) => (
        <button
          type="button"
          role="menuitemradio"
          aria-checked={account.id === active?.id}
          key={account.id}
          className="account-menu-item"
          data-testid={`account-option-${account.id}`}
          onClick={() => { onSelect(account.id); close(); }}
        >
          <Avatar name={account.username} size={22} />
          <span className="account-menu-text">
            <span className="account-menu-name">{account.username}</span>
            <span className="account-menu-kind">{account.type === 'microsoft' ? 'Microsoft' : 'Offline'}</span>
          </span>
          {account.id === active?.id ? <Check size={14} strokeWidth={2.8} className="account-menu-check" /> : null}
        </button>
      )) : <span className="account-menu-empty">No accounts yet</span>}

      <div className="account-menu-divider" />

      <button
        type="button"
        role="menuitem"
        className="account-menu-item account-menu-item--action"
        data-testid="account-add-microsoft"
        onClick={() => { onLoginMicrosoft(); close(); }}
      >
        <span className="account-menu-icon"><LogIn size={14} strokeWidth={2.3} /></span>
        <span className="account-menu-name">Add Microsoft account</span>
      </button>

      <form className="account-offline" onSubmit={submit}>
        <input
          className="account-offline-input"
          value={name}
          maxLength={16}
          spellCheck="false"
          autoComplete="off"
          placeholder="Offline username"
          aria-label="Offline username"
          data-testid="offline-username-input"
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="submit"
          className="account-offline-add"
          disabled={!valid}
          aria-label="Add offline account"
          data-testid="offline-username-submit"
        >
          <Plus size={14} strokeWidth={2.8} />
        </button>
      </form>
    </div>
  );
}

function AccountPill(props) {
  const [open, setOpen] = useState(false);
  const holder = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(holder, open, close);
  const { active, accounts } = props;

  return (
    <div className="account" ref={holder}>
      <button
        type="button"
        className={`account-pill${open ? ' account-pill--open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="account-pill"
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={active?.username} size={20} />
        <span className="account-text">
          <span className="account-name">{active?.username || 'Sign in'}</span>
          <span className="account-kind">
            {active ? (active.type === 'microsoft' ? 'Microsoft' : 'Offline') : 'No account'}
          </span>
        </span>
        <span className="account-count">
          <Users size={12} strokeWidth={2.4} />
          {accounts.length}
        </span>
      </button>

      {open ? <AccountMenu {...props} close={close} /> : null}
    </div>
  );
}

export default function TitleBar({ session, instance, ...account }) {
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="titlebar-mark" aria-hidden="true">
          <span className="titlebar-mark-face" />
        </span>
        <span className="titlebar-names">
          <span className="titlebar-wordmark">COBBLESTONE</span>
          <span className="titlebar-tagline">Java Launcher</span>
        </span>
      </div>

      <div className="titlebar-drag">
        <SessionChip session={session} instance={instance} />
      </div>

      <AccountPill {...account} />

      <div className="titlebar-controls">
        <button
          type="button"
          className="win-button"
          aria-label="Minimize"
          data-testid="window-minimize"
          onClick={() => bridge.window.minimize()}
        >
          <Minus size={15} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="win-button"
          aria-label="Maximize"
          data-testid="window-maximize"
          onClick={() => bridge.window.maximize()}
        >
          <Square size={11} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="win-button win-button--close"
          aria-label="Close"
          data-testid="window-close"
          onClick={() => bridge.window.close()}
        >
          <X15 />
        </button>
      </div>
    </header>
  );
}

/* Local alias so the close glyph keeps the same weight as the other controls. */
function X15() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
