import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildPolicy, CSP_PLACEHOLDER, inlineSingleFile } from '../../build/inlineSingleFile';
import { BLOCKED_GLOBALS, exposedGlobals, sealScope } from '../../src/worker/seal';
import { isWorkerResponse } from '../../src/worker/protocol';
import { sampleIdJpeg } from '../../scripts/lib/sampleDocs';
import { withJpegSize } from '../support/jpeg';

describe('worker seal', () => {
  /** Mimics a worker global: APIs live on the prototype, constructors on the object. */
  function fakeWorkerScope() {
    const proto = { fetch: () => 'sent', importScripts: () => {}, indexedDB: {}, caches: {} };
    const scope = Object.create(proto) as Record<string, unknown>;
    Object.assign(scope, {
      XMLHttpRequest: function XMLHttpRequest() {},
      WebSocket: function WebSocket() {},
      EventSource: function EventSource() {},
      navigator: {},
      postMessage: () => {},
    });
    return scope;
  }

  it('removes every network, storage and code-loading API', () => {
    const scope = fakeWorkerScope();
    expect(exposedGlobals(scope).length).toBeGreaterThan(0);
    sealScope(scope);
    expect(exposedGlobals(scope)).toEqual([]);
    expect(scope.postMessage).toBeTypeOf('function'); // still able to reply
  });

  it('cannot be undone by reassigning or redefining', () => {
    const scope = fakeWorkerScope();
    sealScope(scope);
    expect(() => {
      'use strict';
      scope.fetch = () => 'sent';
    }).toThrow();
    expect(() => Object.defineProperty(scope, 'fetch', { value: () => 'sent' })).toThrow();
    expect(scope.fetch).toBeUndefined();
  });

  it('covers the APIs that could send data anywhere', () => {
    for (const name of [
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'EventSource',
      'WebTransport',
      'importScripts',
      'RTCPeerConnection',
      'FontFace',
      'webkitRequestFileSystem',
    ]) {
      expect(BLOCKED_GLOBALS).toContain(name);
    }
  });
});

describe('worker messages', () => {
  it('accepts only well-formed replies', () => {
    expect(isWorkerResponse({ type: 'progress', done: 1, total: 2 })).toBe(true);
    expect(
      isWorkerResponse({
        type: 'done',
        bytes: new Uint8Array(),
        pageCount: 3,
        sectionBytes: [0, 12],
        cleanupSavings: 5,
      }),
    ).toBe(true);
    expect(
      isWorkerResponse({
        type: 'done',
        bytes: new Uint8Array(),
        pageCount: 3,
        sectionBytes: ['x'],
        cleanupSavings: 5,
      }),
    ).toBe(false);
    expect(isWorkerResponse({ type: 'seal-report', exposed: [] })).toBe(true);
    expect(isWorkerResponse({ type: 'error', message: 'x', details: [], expected: true })).toBe(true);
    const shrink = (source: unknown, id = 1) =>
      isWorkerResponse({ type: 'shrink-image', id, source, maxEdge: 1600, quality: 0.8 });
    expect(shrink({ kind: 'jpeg', bytes: sampleIdJpeg() })).toBe(true);
    expect(shrink({ kind: 'jpeg', bytes: sampleIdJpeg() }, 1.5)).toBe(false);
    expect(shrink({ kind: 'jpeg', bytes: new Uint8Array() })).toBe(false); // no size to check
    expect(shrink({ kind: 'jpeg', bytes: withJpegSize(sampleIdJpeg(), 60_000, 60_000) })).toBe(false); // too big to draw
    expect(shrink({ kind: 'jpeg', bytes: 'x' })).toBe(false);
    const pixels = { kind: 'pixels', bytes: new Uint8Array(2 * 3 * 3), width: 2, height: 3, channels: 3 };
    expect(shrink(pixels)).toBe(true);
    expect(shrink({ ...pixels, channels: 1 })).toBe(false); // byte count doesn't match the size
    expect(shrink({ ...pixels, channels: 4, bytes: new Uint8Array(24) })).toBe(false);
    expect(shrink({ ...pixels, width: 0, bytes: new Uint8Array() })).toBe(false);
    expect(shrink({ ...pixels, width: 100_000, height: 100_000 })).toBe(false); // too big to draw
    expect(shrink({ kind: 'svg', bytes: new Uint8Array() })).toBe(false);
    for (const bad of [
      null,
      'done',
      {},
      { type: 'done', bytes: 'x', pageCount: 1 },
      { type: 'error', message: 1 },
      { type: 'eval' },
    ]) {
      expect(isWorkerResponse(bad)).toBe(false);
    }
  });
});

describe('single-file build and content security policy', () => {
  const sha256 = (text: string) => `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;

  it('forbids all network access and allows only the inlined code', () => {
    const policy = buildPolicy(['sha256-abc'], ['sha256-def']);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("script-src 'sha256-abc'");
    expect(policy).toContain("style-src 'sha256-def'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).not.toMatch(/unsafe|https?:|\*/);
  });

  it('inlines the bundle into index.html and pins it by hash', () => {
    const plugin = inlineSingleFile();
    const bundle: Record<string, unknown> = {
      'index.html': {
        type: 'asset',
        fileName: 'index.html',
        source: `<meta http-equiv="Content-Security-Policy" content="${CSP_PLACEHOLDER}"><script type="module" crossorigin src="./assets/index-x.js"></script><link rel="stylesheet" crossorigin href="./assets/index-y.css">`,
      },
      'assets/index-x.js': { type: 'chunk', isEntry: true, code: 'console.log("</script>")' },
      'assets/index-y.css': { type: 'asset', fileName: 'assets/index-y.css', source: 'body{color:red}' },
    };
    const hook = plugin.generateBundle as unknown as (
      this: { error: (m: string) => never },
      o: unknown,
      b: typeof bundle,
    ) => void;
    hook.call(
      {
        error: (message) => {
          throw new Error(message);
        },
      },
      {},
      bundle,
    );

    expect(Object.keys(bundle)).toEqual(['index.html']);
    const html = String((bundle['index.html'] as { source: string }).source);
    expect(html).toContain('<script type="module">console.log("<\\/script>")</script>');
    expect(html).toContain('<style>body{color:red}</style>');
    expect(html).not.toContain(CSP_PLACEHOLDER);
    // The hashes must be of exactly the inlined text, after escaping, or the browser blocks it.
    const script = /<script type="module">(.*?)<\/script>/s.exec(html)?.[1] ?? '';
    const style = /<style>(.*?)<\/style>/s.exec(html)?.[1] ?? '';
    expect(html).toContain(`script-src '${sha256(script)}'`);
    expect(html).toContain(`style-src '${sha256(style)}'`);
  });
});

describe('lint rules guarding the app code', () => {
  it('reject network, storage, navigation and HTML-parsing APIs in src/', async () => {
    const { ESLint } = await import('eslint');
    // The snippets aren't files on disk, so lint them without type information.
    const eslint = new ESLint({
      overrideConfig: {
        languageOptions: { parserOptions: { projectService: false } },
        rules: { '@typescript-eslint/no-floating-promises': 'off', '@typescript-eslint/no-misused-promises': 'off' },
      },
    });
    const offenders = [
      "fetch('https://example.com');",
      "self.fetch('https://example.com');",
      "navigator.sendBeacon('/x', 'data');",
      'navigator.storage.getDirectory();',
      'navigator.serviceWorker.register;',
      "localStorage.setItem('k', 'v');",
      "globalThis.indexedDB.open('x');",
      "cookieStore.set('k', 'v');",
      "document.body.innerHTML = '<b>x</b>';",
      'document.cookie;',
      "window.open('https://example.com');",
      "open('https://example.com');",
      "location.href = 'https://example.com';",
      "window.location.assign('https://example.com');",
      "document.location = 'https://example.com';",
      "new WebSocket('wss://example.com');",
      "eval('1');",
    ];
    for (const code of offenders) {
      const [result] = await eslint.lintText(`export {};\n${code}\n`, { filePath: 'src/ui/example.ts' });
      const rules = result?.messages.map((message) => message.ruleId) ?? [];
      expect(rules, code).toEqual(expect.arrayContaining([expect.stringMatching(/^no-(restricted-\w+|eval)$/)]));
      expect(rules, code).not.toContain(null); // a parsing error would pass the check above vacuously
    }
  });
});
