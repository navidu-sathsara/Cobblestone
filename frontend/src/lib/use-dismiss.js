import { useEffect } from 'react';

/**
 * Closes a popover on outside pointerdown or Escape. Shared by the account menu
 * and the launch-target dropdown so both dismiss identically.
 */
export function useDismiss(ref, open, onClose) {
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, open, onClose]);
}
