import { useEffect, useState } from 'react';

/**
 * Thin banner that appears at the top of the app when an update is available.
 * Stays out of the way until there's something to show.
 */
export default function UpdateBanner() {
  const [status, setStatus] = useState(null); // null = nothing to show
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = window.native?.updater?.onStatus((s) => {
      setStatus(s);
      if (s.type !== 'downloading') setBusy(false);
    });
    return () => unsub?.();
  }, []);

  const handleDownload = async () => {
    setBusy(true);
    await window.native?.updater?.download();
  };

  const handleInstall = () => {
    window.native?.updater?.install();
  };

  const handleDismiss = () => setStatus(null);

  if (!status) return null;

  // only render for actionable states
  if (!['available', 'downloading', 'downloaded', 'error'].includes(status.type)) return null;

  return (
    <div className="update-banner">
      {status.type === 'available' && (
        <>
          <span className="update-banner__msg">
            Update <strong>v{status.version}</strong> is available
          </span>
          <div className="update-banner__actions">
            <button className="update-banner__btn update-banner__btn--primary" onClick={handleDownload} disabled={busy}>
              Download
            </button>
            <button className="update-banner__btn" onClick={handleDismiss}>
              Later
            </button>
          </div>
        </>
      )}

      {status.type === 'downloading' && (
        <>
          <span className="update-banner__msg">
            Downloading update… {Math.round(status.percent ?? 0)}%
          </span>
          <div className="update-banner__progress">
            <div
              className="update-banner__progress-fill"
              style={{ width: `${status.percent ?? 0}%` }}
            />
          </div>
        </>
      )}

      {status.type === 'downloaded' && (
        <>
          <span className="update-banner__msg">
            Update <strong>v{status.version}</strong> ready — restart to apply
          </span>
          <div className="update-banner__actions">
            <button className="update-banner__btn update-banner__btn--primary" onClick={handleInstall}>
              Restart &amp; Install
            </button>
            <button className="update-banner__btn" onClick={handleDismiss}>
              Later
            </button>
          </div>
        </>
      )}

      {status.type === 'error' && (
        <>
          <span className="update-banner__msg update-banner__msg--error" title={status.message}>
            Update failed: {truncate(status.message)}
          </span>
          <button className="update-banner__btn" onClick={handleDismiss}>✕</button>
        </>
      )}
    </div>
  );
}

// Main already strips the response headers, but a single line can still be
// long enough to push the dismiss button off the banner.
function truncate(message, max = 120) {
  const text = String(message ?? '').trim() || 'Unknown error';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
