import { useEffect, useState } from 'react';

const DEFAULT_DATA = { instances: [], selectedId: null };

async function loadData() {
  if (window.native?.instances) {
    return (await window.native.instances.load()) ?? DEFAULT_DATA;
  }
  const raw = localStorage.getItem('native.instances');
  return raw ? JSON.parse(raw) : DEFAULT_DATA;
}

function saveData(data) {
  if (window.native?.instances) {
    return window.native.instances.save(data);
  } else {
    localStorage.setItem('native.instances', JSON.stringify(data));
    return Promise.resolve();
  }
}

export default function useInstances() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadData()
      .then((saved) => {
        if (!cancelled) setData(saved);
      })
      .catch((err) => console.error('Could not load instances:', err))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveData(data).catch((err) => console.error('Could not save instances:', err));
  }, [data, loaded]);

  const selected =
    data.instances.find((i) => i.id === data.selectedId) ?? data.instances[0] ?? null;

  return {
    instances: data.instances,
    selected,
    loaded,

    select(id) {
      setData((current) => ({ ...current, selectedId: id }));
    },

    create(values) {
      const instance = { ...values, id: crypto.randomUUID(), created: Date.now(), lastPlayed: null };
      setData((current) => ({
        ...current,
        instances: [...current.instances, instance],
        selectedId: instance.id
      }));
    },

    /** add a fully-formed instance (e.g. from a modpack install) */
    add(instance) {
      setData((current) => ({
        ...current,
        instances: [...current.instances, instance],
        selectedId: instance.id
      }));
    },

    update(id, values) {
      setData((current) => ({
        ...current,
        instances: current.instances.map((i) => (i.id === id ? { ...i, ...values } : i))
      }));
    },

    remove(id) {
      setData((current) => {
        const instances = current.instances.filter((i) => i.id !== id);
        return {
          ...current,
          instances,
          selectedId: current.selectedId === id ? instances[0]?.id ?? null : current.selectedId
        };
      });
    }
  };
}
