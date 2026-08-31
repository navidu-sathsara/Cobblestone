import { createMockBridge } from './mock-bridge.js';

/**
 * The renderer never touches ipcRenderer. `window.cobblestone` is the narrow
 * surface installed by electron/preload.js; when the page is opened in a plain
 * browser we fall back to a mock so the UI can be developed standalone.
 */
export const isDesktop = Boolean(globalThis.window?.cobblestone);

export const bridge = globalThis.window?.cobblestone ?? createMockBridge();

/**
 * Subscribes to one backend event for the lifetime of an effect. Returns the
 * unsubscribe function so it can be handed straight back from `useEffect`.
 */
export function subscribe(name, listener) {
  return bridge.on(name, listener);
}

/**
 * Runs a bridge call and reports failure through `onError` instead of throwing
 * into React's render path. Backend errors carry a stable `code`.
 */
export async function attempt(operation, onError) {
  try {
    return await operation();
  } catch (error) {
    onError?.(error?.message || 'Something went wrong', error?.code);
    return null;
  }
}
