import { defineConfig } from 'vitest/config';
import { inlineSingleFile } from './build/inlineSingleFile.ts';

export default defineConfig({
  // Relative paths so the built file works from any folder on disk.
  base: './',
  plugins: [inlineSingleFile()],
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
