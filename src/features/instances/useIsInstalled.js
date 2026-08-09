import { useEffect, useState } from 'react';

/**
 * True when the instance's client jar is on disk.
 *
 * Optimistic: assumes installed in a plain browser and when the check fails, so
 * a working Launch button is never replaced by Install on a bad reading.
 *
 * Pass the launcher status as `settleKey`. The check re-runs whenever it
 * changes, so finishing an install flips the button from Install to Launch
 * without needing an app restart.
 */
export default function useIsInstalled(instance, settleKey) {
  const [installed, setInstalled] = useState(true);
  const version = instance?.version;
  const loader = instance?.loader;

  useEffect(() => {
    if (!version) return undefined;
    const api = window.native?.instance;
    if (!api) return undefined;

    // Switching instances mid-flight would otherwise let a slow answer for the
    // old one overwrite the new one's.
    let cancelled = false;
    api
      .isInstalled(version, loader)
      .then((result) => { if (!cancelled) setInstalled(Boolean(result)); })
      .catch(() => { if (!cancelled) setInstalled(true); });

    return () => { cancelled = true; };
  }, [version, loader, settleKey]);

  return installed;
}
