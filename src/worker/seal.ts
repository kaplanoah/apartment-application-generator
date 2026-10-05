/**
 * Removes every way out of a worker before untrusted-by-default code runs in
 * it. The browser's Content-Security-Policy already blocks network access;
 * this is a second, independent layer in case a browser doesn't apply that
 * policy to workers, or a dependency is ever compromised.
 */
export const BLOCKED_GLOBALS = [
  // Network
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebSocketStream',
  'EventSource',
  'WebTransport',
  'RTCPeerConnection',
  'webkitRTCPeerConnection',
  'RTCDataChannel',
  // Loading more code or spawning helpers
  'importScripts',
  'Worker',
  'SharedWorker',
  // Loading resources by URL
  'fonts',
  'FontFace',
  'Notification',
  // Storage and other channels
  'indexedDB',
  'caches',
  'webkitRequestFileSystem',
  'webkitRequestFileSystemSync',
  'webkitResolveLocalFileSystemURL',
  'webkitResolveLocalFileSystemSyncURL',
  'BroadcastChannel',
  'navigator',
] as const;

/**
 * Deletes the blocked globals from `scope` and its prototype chain, then pins
 * each one to `undefined` so it can't be put back.
 */
export function sealScope(scope: object): void {
  for (const name of BLOCKED_GLOBALS) {
    for (let target: object | null = scope; target; target = Object.getPrototypeOf(target)) {
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      if (descriptor?.configurable) Reflect.deleteProperty(target, name);
    }
    try {
      Object.defineProperty(scope, name, { value: undefined, writable: false, configurable: false });
    } catch {
      // A non-configurable own property can't be replaced; reported below.
    }
  }
}

/** Names from the blocklist that are still reachable (should be none). */
export function exposedGlobals(scope: object): string[] {
  return BLOCKED_GLOBALS.filter((name) => (scope as Record<string, unknown>)[name] !== undefined);
}
