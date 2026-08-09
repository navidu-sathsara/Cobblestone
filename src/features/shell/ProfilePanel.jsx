import { useState } from 'react';
import { LogIn, LogOut, UserPlus, Check, X, Loader2 } from 'lucide-react';
import './ProfilePanel.css';

function AccountRow({ acc, onSwitch, onRemove }) {
  const avatarSrc = `https://mc-heads.net/avatar/${acc.uuid ?? 'MHF_Steve'}/60`;
  return (
    <button className="pp-account-row" onClick={() => onSwitch(acc.id)}>
      <img className="pp-account-avatar-sm" src={avatarSrc} alt="" />
      <span className="pp-account-name">{acc.name}</span>
      {acc.type === 'offline' && <span className="pp-offline-badge">Offline</span>}
      <button
        className="pp-account-remove"
        title="Remove"
        onClick={(e) => { e.stopPropagation(); onRemove(acc.id); }}
      >
        <X size={11} />
      </button>
    </button>
  );
}

export default function ProfilePanel({
  account,
  accounts = [],
  activeId,
  onSwitchAccount = () => {},
  onRemoveAccount = () => {},
  onAddOffline    = () => {},
  onAddMicrosoft  = () => {},
  onClose
}) {
  const isMs     = account?.isMicrosoft;
  const isOffline = account?.type === 'offline';
  const avatarSrc = `https://mc-heads.net/avatar/${account?.uuid ?? 'MHF_Steve'}/120`;

  const [showAdd, setShowAdd]         = useState(false);
  const [offlineName, setOfflineName] = useState('');
  const [offlineError, setOfflineError] = useState('');
  const [msBusy, setMsBusy]           = useState(false);

  const otherAccounts = accounts.filter(a => a.id !== activeId);

  const handleAddOffline = async () => {
    const trimmed = offlineName.trim();
    if (!trimmed) { setOfflineError('Enter a username'); return; }
    if (!/^[a-zA-Z0-9_]{2,16}$/.test(trimmed)) {
      setOfflineError('2–16 chars, letters / numbers / underscores');
      return;
    }
    const res = await onAddOffline(trimmed);
    if (res?.ok === false) { setOfflineError(res.error ?? 'Failed'); return; }
    setOfflineName(''); setOfflineError(''); setShowAdd(false);
    onClose?.();
  };

  const handleAddMs = async () => {
    setMsBusy(true);
    await onAddMicrosoft();
    setMsBusy(false); setShowAdd(false);
    onClose?.();
  };

  const closeAdd = () => {
    setShowAdd(false); setOfflineName(''); setOfflineError('');
  };

  return (
    <div className="profile-panel">

      {/* ── current account header ── */}
      <div className="pp-header">
        <img className="pp-avatar" src={avatarSrc} alt="" />
        <div className="pp-identity">
          <span className="pp-name">{account?.name ?? 'Guest'}</span>
          <span className={`pp-badge${isMs ? ' pp-badge-ms' : ''}`}>
            {isMs ? 'Microsoft Account' : isOffline ? 'Offline Account' : 'Guest Mode'}
          </span>
        </div>
      </div>

      {/* ── other saved accounts ── */}
      {otherAccounts.length > 0 && (
        <>
          <div className="pp-sep" />
          <div className="pp-accounts">
            {otherAccounts.map(a => (
              <AccountRow
                key={a.id}
                acc={a}
                onSwitch={(id) => { onSwitchAccount(id); onClose?.(); }}
                onRemove={onRemoveAccount}
              />
            ))}
          </div>
        </>
      )}

      <div className="pp-sep" />

      {/* ── add another account ── */}
      <div className="pp-body">
        {showAdd ? (
          <div className="pp-add-form">
            <p className="pp-add-title">Add account</p>

            <input
              className="pp-add-input"
              placeholder="Username (offline)"
              value={offlineName}
              onChange={(e) => { setOfflineName(e.target.value); setOfflineError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddOffline()}
              autoFocus
            />
            {offlineError && <p className="pp-add-error">{offlineError}</p>}

            <button className="pp-action pp-add-confirm" onClick={handleAddOffline}>
              Add offline account
            </button>

            <div className="pp-add-or"><span>or</span></div>

            <button
              className="pp-action pp-action-signin"
              disabled={msBusy}
              onClick={handleAddMs}
            >
              {msBusy
                ? <><Loader2 size={14} className="spin" /> Waiting for Microsoft…</>
                : <><LogIn size={14} /> Sign in with Microsoft</>
              }
            </button>

            <button className="pp-action pp-add-cancel" onClick={closeAdd}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button className="pp-action" onClick={() => setShowAdd(true)}>
              <UserPlus size={14} />
              Add another account
            </button>

            <div className="pp-sep pp-sep-inline" />

            {isMs || isOffline ? (
              <button
                className="pp-action pp-action-danger"
                onClick={() => { onRemoveAccount(activeId); onClose?.(); }}
              >
                <LogOut size={14} />
                {isMs ? 'Sign out' : 'Remove account'}
              </button>
            ) : (
              <button
                className="pp-action pp-action-signin"
                onClick={handleAddMs}
              >
                <LogIn size={14} />
                Sign in with Microsoft
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
