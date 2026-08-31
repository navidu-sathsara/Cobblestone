import { useCallback, useRef, useState } from 'react';
import {
  Check, ChevronDown, LoaderCircle, LogIn, Minus, Plus, ShieldCheck, Square, User, X,
} from 'lucide-react';
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

function AccountModal({ accounts, active, login, onSelect, onAddOffline, onLoginMicrosoft, close, panelRef }) {
  const [name, setName] = useState('');
  const [addingOffline, setAddingOffline] = useState(false);
  const valid = OFFLINE_NAME.test(name);

  const submit = async (event) => {
    event.preventDefault();
    if (!valid || addingOffline || login.busy) return;
    setAddingOffline(true);
    const account = await onAddOffline(name);
    setAddingOffline(false);
    if (account) {
      setName('');
      close();
    }
  };

  return (
    <div className="account-modal-backdrop" data-testid="account-menu">
      <section
        className="account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
        ref={panelRef}
      >
        <header className="account-modal-head">
          <span className="account-modal-mark"><ShieldCheck size={20} strokeWidth={2.2} /></span>
          <span className="account-modal-heading">
            <span className="account-modal-kicker">Cobblestone account</span>
            <h2 id="account-modal-title">Choose how you play</h2>
          </span>
          <button type="button" className="account-modal-close" aria-label="Close accounts" onClick={close}>
            <X size={17} strokeWidth={2.3} />
          </button>
        </header>

        <div className="account-modal-body">
          {accounts.length ? (
            <div className="account-profiles">
              <span className="account-section-label">Saved profiles</span>
              <div className="account-profile-list">
                {accounts.map((account) => (
                  <button
                    type="button"
                    aria-pressed={account.id === active?.id}
                    key={account.id}
                    className={`account-profile${account.id === active?.id ? ' account-profile--active' : ''}`}
                    data-testid={`account-option-${account.id}`}
                    onClick={async () => { if (await onSelect(account.id)) close(); }}
                  >
                    <Avatar name={account.username} size={34} />
                    <span className="account-profile-text">
                      <span className="account-profile-name">{account.username}</span>
                      <span className="account-profile-kind">
                        {account.type === 'microsoft' ? 'Microsoft account' : 'Offline profile'}
                      </span>
                    </span>
                    {account.id === active?.id ? (
                      <span className="account-profile-check"><Check size={14} strokeWidth={3} /></span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="account-modal-empty">Sign in once and your profile will stay ready for the next launch.</p>
          )}

          <button
            type="button"
            className="microsoft-login"
            data-testid="account-add-microsoft"
            disabled={login.busy || addingOffline}
            onClick={async () => { if (await onLoginMicrosoft()) close(); }}
          >
            <span className="microsoft-logo" aria-hidden="true"><i /><i /><i /><i /></span>
            <span className="microsoft-login-copy">
              <strong>{active?.type === 'microsoft' ? 'Add another Microsoft account' : 'Sign in with Microsoft'}</strong>
              <small className={login.stage === 'failed' ? 'account-login-error' : undefined}>
                {login.busy || login.stage === 'failed'
                  ? login.message
                  : 'Use your Minecraft Java profile'}
              </small>
            </span>
            {login.busy ? <LoaderCircle className="account-spinner" size={18} /> : <LogIn size={18} strokeWidth={2.2} />}
          </button>

          <div className="account-divider"><span>or play offline</span></div>

          <form className="account-offline" onSubmit={submit}>
            <label htmlFor="offline-username">Offline username</label>
            <div className="account-offline-row">
              <input
                id="offline-username"
                className="account-offline-input"
                value={name}
                maxLength={16}
                spellCheck="false"
                autoComplete="off"
                placeholder="Player name"
                data-testid="offline-username-input"
                disabled={login.busy || addingOffline}
                onChange={(event) => setName(event.target.value)}
              />
              <button
                type="submit"
                className="account-offline-add"
                disabled={!valid || login.busy || addingOffline}
                data-testid="offline-username-submit"
              >
                {addingOffline ? <LoaderCircle className="account-spinner" size={15} /> : <Plus size={15} strokeWidth={2.8} />}
                Add profile
              </button>
            </div>
            <small>Offline profiles cannot join online-mode servers.</small>
          </form>
        </div>
      </section>
    </div>
  );
}

function AccountControl({ open, onOpenChange, ...props }) {
  const panel = useRef(null);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useDismiss(panel, open, close);
  const { active, accounts } = props;

  return (
    <div className="account">
      <button
        type="button"
        className={`account-trigger${active ? ' account-trigger--profile' : ' account-trigger--signin'}${open ? ' account-trigger--open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="account-pill"
        onClick={() => onOpenChange(!open)}
      >
        {active ? <Avatar name={active.username} size={23} /> : <LogIn size={15} strokeWidth={2.4} />}
        <span className="account-trigger-copy">
          <strong>{active?.username || 'Sign in'}</strong>
          {active ? <small>{active.type === 'microsoft' ? 'Microsoft' : 'Offline'}</small> : null}
        </span>
        {accounts.length > 1 ? <span className="account-trigger-count">{accounts.length}</span> : null}
        <ChevronDown className={open ? 'account-chevron account-chevron--open' : 'account-chevron'} size={14} />
      </button>

      {open ? <AccountModal {...props} close={close} panelRef={panel} /> : null}
    </div>
  );
}

export default function TitleBar({ session, instance, accountOpen, onAccountOpenChange, ...account }) {
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

      <AccountControl open={accountOpen} onOpenChange={onAccountOpenChange} {...account} />

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
