import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const PRIVACY_MESSAGE = 'This app must never use the network or browser storage. See SECURITY.md.';
const HTML_MESSAGE = 'Build elements with h() from src/ui/dom.ts; never parse strings as HTML.';
/** Ways out that are reachable both as globals and as properties of window, self and friends. */
const NETWORK_AND_STORAGE = [
  'fetch',
  'open',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'cookieStore',
];

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', 'example/', '.claude/worktrees/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    // Promises that are never awaited hide failures, including assertions in browser tests.
    files: ['**/*.ts'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    // App code: enforce the privacy guarantees at the source level too. The CSP blocks
    // requests but not navigation, so changing the page's location is banned here.
    files: ['src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-globals': [
        'error',
        ...[...NETWORK_AND_STORAGE, 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport'].map((name) => ({
          name,
          message: PRIVACY_MESSAGE,
        })),
        ...['RTCPeerConnection', 'importScripts', 'SharedWorker', 'BroadcastChannel'].map((name) => ({
          name,
          message: PRIVACY_MESSAGE,
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...['innerHTML', 'outerHTML', 'insertAdjacentHTML'].map((property) => ({ property, message: HTML_MESSAGE })),
        { object: 'document', property: 'write', message: HTML_MESSAGE },
        { object: 'document', property: 'cookie', message: PRIVACY_MESSAGE },
        { object: 'document', property: 'location', message: PRIVACY_MESSAGE },
        ...['sendBeacon', 'storage', 'serviceWorker'].map((property) => ({
          object: 'navigator',
          property,
          message: PRIVACY_MESSAGE,
        })),
        ...['window', 'globalThis', 'self', 'top', 'parent'].flatMap((object) =>
          NETWORK_AND_STORAGE.map((property) => ({ object, property, message: PRIVACY_MESSAGE })),
        ),
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts', 'build/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
