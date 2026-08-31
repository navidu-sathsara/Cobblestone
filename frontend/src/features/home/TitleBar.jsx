import { useCallback, useRef, useState } from 'react';
import { Check, ChevronDown, LogIn, Minus, Pickaxe, Square, User, UserPlus, X } from 'lucide-react';
import { bridge } from '../../lib/bridge.js';
import { headUrl } from '../../lib/format.js';
import { useDismiss } from '../../lib/use-dismiss.js';
import './TitleBar.css';

function Avatar({ name, size }) {
  const [failed, setFailed] = useState(false);
  if (!name || failed) {
    return (
      <span className="avatar avatar--fallback" style={{ width: size, height: size }}>
        <User size={Math.round(size * 0.62)} strokeWidth={2.2} />
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

function AccountPill({ accounts, active, onSelect, onAddOffline, onLoginMicrosoft }) {
  const [open, setOpen] = useState(false);
  const holder = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(holder, open, close);

  const addOffline = () => {
    // eslint-disable-next-line no-alert -- deliberate: the shell has no modal system yet.
    const username = window.prompt('Offline username (1-16 letters, numbers or _)');
    if (username) onAddOffline(username.trim());
    close();
  };

  return (
    <div className="account" ref={holder}>
      <button
        type="button"
        className="account-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={active?.username} size={18} />
        <span className="account-name">{active?.username || 'Sign in'}</span>
        <ChevronDown size={13} strokeWidth={2.4} className="account-caret" />
      </button>

      {open ? (
        <div className="account-menu" role="menu">
          {accounts.map((account) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={account.id === active?.id}
              key={account.id}
              className="account-menu-item"
              onClick={() => { onSelect(account.id); close(); }}
            >
              <Avatar name={account.username} size={20} />
              <span className="account-menu-text">
                <span className="account-menu-name">{account.username}</span>
                <span className="account-menu-kind">{account.type === 'microsoft' ? 'Microsoft' : 'Offline'}</span>
              </span>
              {account.id === active?.id ? <Check size={14} strokeWidth={2.6} /> : null}
            </button>
          ))}

          {accounts.length ? <div className="account-menu-divider" /> : null}

          <button type="button" role="menuitem" className="account-menu-item" onClick={() => { onLoginMicrosoft(); close(); }}>
            <span className="account-menu-icon"><LogIn size={14} strokeWidth={2.2} /></span>
            <span className="account-menu-name">Add Microsoft account</span>
          </button>
          <button type="button" role="menuitem" className="account-menu-item" onClick={addOffline}>
            <span className="account-menu-icon"><UserPlus size={14} strokeWidth={2.2} /></span>
            <span className="account-menu-name">Add offline account</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function TitleBar(props) {
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="titlebar-logo">
          <Pickaxe size={17} strokeWidth={2.4} />
        </span>
        <span className="titlebar-wordmark">COBBLESTONE</span>
      </div>

      <div className="titlebar-drag" />

      <AccountPill {...props} />

      <div className="titlebar-controls">
        <button type="button" className="win-button" aria-label="Minimize" onClick={() => bridge.window.minimize()}>
          <Minus size={15} strokeWidth={2} />
        </button>
        <button type="button" className="win-button" aria-label="Maximize" onClick={() => bridge.window.maximize()}>
          <Square size={11} strokeWidth={2.2} />
        </button>
        <button type="button" className="win-button win-button--close" aria-label="Close" onClick={() => bridge.window.close()}>
          <X size={15} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
