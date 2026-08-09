import { useEffect, useRef, useState } from 'react';

const IDLE = { status: 'idle', detail: '', percent: 0 };
const INSTALLING = new Set(['preparing', 'downloading']);

export function useLauncherInstallLock() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const api = window.native?.launcher;
    if (!api) return undefined;
    return api.onState(({ status }) => {
      const next = INSTALLING.has(status);
      setLocked((current) => (current === next ? current : next));
    });
  }, []);

  return locked;
}

export default function useLauncher() {
  const [state, setState] = useState(IDLE);
  const errorTimer = useRef(null);

  useEffect(() => {
    const api = window.native?.launcher;
    if (!api) return undefined;

    const offState = api.onState(({ status, detail }) => {
      clearTimeout(errorTimer.current);
      setState((prev) => ({
        status,
        detail,
        percent: status === 'idle' || status === 'error' ? 0 : prev.percent
      }));
      if (status === 'error') {
        errorTimer.current = setTimeout(() => setState(IDLE), 7000);
      }
    });

    const offProgress = api.onProgress(({ percent, detail }) => {
      setState({ status: 'downloading', percent, detail });
    });

    return () => {
      offState();
      offProgress();
      clearTimeout(errorTimer.current);
    };
  }, []);

  const launch = (instance, account) => {
    const api = window.native?.launcher;
    if (!api) {
      setState({ status: 'error', detail: 'Launching only works in the desktop app.', percent: 0 });
      errorTimer.current = setTimeout(() => setState(IDLE), 5000);
      return;
    }
    api.launch(instance, {
      username: account?.name ?? 'Player',
      useMicrosoft: Boolean(account?.isMicrosoft)
    });
  };

  const kill = () => window.native?.launcher?.kill();

  const busy = !['idle', 'error'].includes(state.status);

  return { ...state, launch, kill, busy };
}
