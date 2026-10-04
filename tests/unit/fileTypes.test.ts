import { describe, expect, it } from 'vitest';
import { documentKindOf, extensionOf, isHiddenName, stripExtension } from '../../src/core/fileTypes';

describe('file types', () => {
  it('recognizes PDFs and photos regardless of case', () => {
    expect(documentKindOf('a.pdf')).toBe('pdf');
    expect(documentKindOf('A.PDF')).toBe('pdf');
    expect(documentKindOf('id.HEIC')).toBe('image');
    expect(documentKindOf('id.jpeg')).toBe('image');
    expect(documentKindOf('notes.docx')).toBeNull();
    expect(documentKindOf('pdf')).toBeNull();
  });

  it('splits extensions', () => {
    expect(extensionOf('a.b.PDF')).toBe('pdf');
    expect(extensionOf('.hidden')).toBe('');
    expect(stripExtension('Cover Letter.pdf')).toBe('Cover Letter');
    expect(stripExtension('README')).toBe('README');
  });

  it('spots hidden and system files', () => {
    for (const name of ['.DS_Store', '._photo.jpg', 'Icon\r', 'Thumbs.db', 'desktop.ini', '__MACOSX', '~$draft.docx']) {
      expect(isHiddenName(name)).toBe(true);
    }
    expect(isHiddenName('Pay Stubs')).toBe(false);
  });
});
