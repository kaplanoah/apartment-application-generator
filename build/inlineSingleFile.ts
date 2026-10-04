import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/**
 * Turns the production build into one self-contained HTML file that works
 * when opened straight from disk (file://), and locks it down with a strict
 * Content-Security-Policy:
 *
 * - the JS and CSS bundles are inlined into index.html and their files dropped;
 * - the CSP placeholder in index.html is replaced with a policy that allows
 *   only those exact inline blocks (by SHA-256 hash) and forbids every kind of
 *   network access.
 *
 * During `vite dev` the placeholder gets a relaxed policy so hot reload works.
 */
export const CSP_PLACEHOLDER = '__CONTENT_SECURITY_POLICY__';

const DEV_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' ws: wss:",
  "img-src 'self' blob: data:",
].join('; ');

export function buildPolicy(scriptHashes: string[], styleHashes: string[]): string {
  return [
    "default-src 'none'",
    `script-src ${scriptHashes.map((h) => `'${h}'`).join(' ')}`,
    `style-src ${styleHashes.map((h) => `'${h}'`).join(' ')}`,
    // Photos are decoded from in-memory blobs and the PDF builder runs in a
    // worker started from one; nothing is ever fetched.
    'img-src blob:',
    'worker-src blob:',
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

const sha256 = (text: string): string => `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;

/** Keeps inlined code from closing its own <script>/<style> element early. */
const escapeClosingTag = (code: string, tag: 'script' | 'style'): string =>
  code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

export function inlineSingleFile(): Plugin {
  return {
    name: 'inline-single-file',
    enforce: 'post',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        return ctx.server ? html.replace(CSP_PLACEHOLDER, DEV_POLICY) : html;
      },
    },
    generateBundle(_options, bundle) {
      const htmlAsset = Object.values(bundle).find((item) => item.type === 'asset' && item.fileName.endsWith('.html'));
      if (!htmlAsset || htmlAsset.type !== 'asset') return;

      let html = String(htmlAsset.source);
      const scripts: string[] = [];
      const styles: string[] = [];

      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type === 'chunk' && item.isEntry) {
          const code = escapeClosingTag(item.code, 'script');
          scripts.push(code);
          html = html.replace(
            new RegExp(`<script[^>]*src="[^"]*${escapeRegExp(fileName)}"[^>]*></script>`),
            () => `<script type="module">${code}</script>`,
          );
          Reflect.deleteProperty(bundle, fileName); // now inlined into index.html
        } else if (item.type === 'asset' && fileName.endsWith('.css')) {
          const css = escapeClosingTag(String(item.source), 'style');
          styles.push(css);
          html = html.replace(
            new RegExp(`<link[^>]*href="[^"]*${escapeRegExp(fileName)}"[^>]*>`),
            () => `<style>${css}</style>`,
          );
          Reflect.deleteProperty(bundle, fileName); // now inlined into index.html
        }
      }

      if (/<script[^>]+src=|<link[^>]+stylesheet/.test(html)) {
        this.error('Some assets were not inlined; the file would not work offline.');
      }
      const policy = buildPolicy(scripts.map(sha256), styles.map(sha256));
      htmlAsset.source = html.replace(CSP_PLACEHOLDER, policy);
    },
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
