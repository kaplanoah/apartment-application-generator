import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const PRIVACY_MESSAGE = 'This app must never use the network or browser storage. See SECURITY.md.';
const HTML_MESSAGE = 'Build elements with h() from src/ui/dom.ts; never parse strings as HTML.';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', 'example/'] },
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
    // App code: enforce the privacy guarantees at the source level too.
    files: ['src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'fetch',
          'XMLHttpRequest',
          'WebSocket',
          'EventSource',
          'WebTransport',
          'RTCPeerConnection',
          'importScripts',
          'SharedWorker',
          'BroadcastChannel',
          'localStorage',
          'sessionStorage',
          'indexedDB',
          'caches',
        ].map((name) => ({ name, message: PRIVACY_MESSAGE })),
      ],
      'no-restricted-properties': [
        'error',
        ...['innerHTML', 'outerHTML', 'insertAdjacentHTML'].map((property) => ({ property, message: HTML_MESSAGE })),
        { object: 'document', property: 'write', message: HTML_MESSAGE },
        { object: 'document', property: 'cookie', message: PRIVACY_MESSAGE },
        { object: 'navigator', property: 'sendBeacon', message: PRIVACY_MESSAGE },
        { object: 'window', property: 'open', message: PRIVACY_MESSAGE },
        ...['fetch', 'localStorage', 'sessionStorage', 'indexedDB'].map((property) => ({
          object: 'window',
          property,
          message: PRIVACY_MESSAGE,
        })),
        ...['fetch', 'localStorage', 'sessionStorage', 'indexedDB'].map((property) => ({
          object: 'globalThis',
          property,
          message: PRIVACY_MESSAGE,
        })),
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts', 'build/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
