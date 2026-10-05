import { describe, expect, it } from 'vitest';
import { formatFileSize } from '../../src/core/fileSize';

describe('formatFileSize', () => {
  it('uses decimal units, as the Finder does', () => {
    expect(formatFileSize(5_140_000)).toBe('5.1 MB'); // 4.9 in binary megabytes
    expect(formatFileSize(1_000_000)).toBe('1.0 MB');
    expect(formatFileSize(999_400)).toBe('999 KB');
    expect(formatFileSize(1_500)).toBe('2 KB');
  });

  it('never shows zero for a non-empty file', () => {
    expect(formatFileSize(120)).toBe('1 KB');
  });
});
