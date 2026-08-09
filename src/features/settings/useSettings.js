import { useEffect, useState } from 'react';

export const DEFAULTS = {
  appearance: { theme: 'redstone' },
  memory: { min: 1, max: 4 },
  java: { paths: { 8: '', 17: '', 21: '' } },
  resolution: { width: 854, height: 480, fullscreen: false },
  behavior: {
    launcherAction: 'keep',
    reopenOnExit: true,
    confirmInstanceDelete: true
  },
  apiKeys: {
    curseforge: ''
  }
};

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override ?? {})) {
    if (
      override[key] &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object'
    ) {
      out[key] = deepMerge(base[key], override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
}

export default function useSettings() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (window.native?.settings) {
      window.native.settings.load().then(setSettings);
    } else {
      const raw = localStorage.getItem('native.settings');
      setSettings(deepMerge(DEFAULTS, raw ? JSON.parse(raw) : {}));
    }
  }, []);

  /** update('memory', 'max', 8) — updates one key in one section and persists */
  const update = (section, key, value) => {
    const next = {
      ...settings,
      [section]: { ...settings[section], [key]: value }
    };
    setSettings(next);
    if (window.native?.settings) {
      window.native.settings.save(next);
    } else {
      localStorage.setItem('native.settings', JSON.stringify(next));
    }
  };

  return { settings, update };
}
