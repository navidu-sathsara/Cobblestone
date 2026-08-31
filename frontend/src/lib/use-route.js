import { useCallback, useEffect, useState } from 'react';

/**
 * Hash routing. The renderer is served from `app://launcher` in the desktop
 * shell, so only the fragment can carry navigation state; using it means the
 * current screen survives a reload and the window's back/forward gestures work.
 */
export const ROUTES = ['play', 'instances', 'content', 'partners', 'settings'];

function read() {
  const id = (globalThis.location?.hash || '').replace(/^#\/?/, '');
  return ROUTES.includes(id) ? id : 'play';
}

export function useRoute() {
  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    if (!ROUTES.includes((window.location.hash || '').replace(/^#\/?/, ''))) {
      window.location.replace('#/play');
    }
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((id) => {
    if (ROUTES.includes(id)) window.location.hash = `#/${id}`;
  }, []);

  return [route, navigate];
}
