import { useEffect, useRef, useState } from 'react';

const IDLE = {
  status: 'idle',
  detail: '',
  percent: 0,
  phase: null,
  task: null,
  total: null,
  bytes: 0,
  size: 0
};
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
      const settled = status === 'idle' || status === 'error';
      setState((prev) => ({
        ...(settled ? IDLE : prev),
        status,
        detail,
        percent: settled ? 0 : prev.percent
      }));
      if (status === 'error') {
        errorTimer.current = setTimeout(() => setState(IDLE), 7000);
      }
    });

    const offProgress = api.onProgress(({ percent, detail, phase, task, total, bytes, size }) => {
      setState((prev) => ({
        ...prev,
        status: 'downloading',
        percent,
        detail,
        phase: phase ?? null,
        task: task ?? null,
        total: total ?? null,
        // Counters restart per phase, so a stale byte total must not linger.
        bytes: bytes ?? 0,
        size: size ?? 0
      }));
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

/** 1.2 GB / 480 MB / 12.4 KB — sized for a one-line progress readout. */
export function formatBytes(bytes) {
  if (!bytes || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
