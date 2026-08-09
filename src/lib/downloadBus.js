/**
 * Module-level pub/sub for active downloads.
 * Any component can subscribe without prop-drilling.
 */
let downloads = {}; // id → { id, name, startedAt }
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn({ ...downloads }));

export const downloadBus = {
  add(id, name) {
    downloads = { ...downloads, [id]: { id, name, startedAt: Date.now() } };
    notify();
  },
  remove(id) {
    const next = { ...downloads };
    delete next[id];
    downloads = next;
    notify();
  },
  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(fn) {
    listeners.add(fn);
    fn({ ...downloads }); // emit current state immediately
    return () => listeners.delete(fn);
  },
};
