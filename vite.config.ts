import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { inlineSingleFile } from './build/inlineSingleFile.ts';

/** The repository's security page, linked from the app. Set by `repository` in package.json. */
function securityPageUrl(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    repository?: { url?: string };
  };
  const repo = (pkg.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error('package.json needs "repository": { "url": "https://github.com/<owner>/<repo>" }');
  }
  return `${repo}/security/policy`;
}

export default defineConfig({
  // Relative paths so the built file works from any folder on disk.
  base: './',
  plugins: [inlineSingleFile()],
  define: { __SECURITY_PAGE_URL__: JSON.stringify(securityPageUrl()) },
  build: {
    target: 'es2022',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: false,
    rolldownOptions: {
      output: { codeSplitting: false },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
