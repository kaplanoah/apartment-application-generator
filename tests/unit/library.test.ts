import { describe, expect, it } from 'vitest';
import { libraryOf } from '../support/library';

describe('buildLibrary', () => {
  it('offers top-level folders and readable top-level files, sorted by name', () => {
    const library = libraryOf([
      'W-2s/noah_2025.pdf',
      'Cover Letter.pdf',
      'ID/license.jpg',
      'Pay Stubs 10/x.pdf',
      'Pay Stubs 9/x.pdf',
    ]);
    expect(library.options.map((o) => [o.kind, o.title])).toEqual([
      ['file', 'Cover Letter'],
      ['folder', 'ID'],
      ['folder', 'Pay Stubs 9'],
      ['folder', 'Pay Stubs 10'],
      ['folder', 'W-2s'],
    ]);
  });

  it('uses only the deepest level of each folder and reports the rest', () => {
    const library = libraryOf([
      'Bank Statements/account-summary.pdf',
      'Bank Statements/Chase/2026-09.pdf',
      'Bank Statements/Ally/2026-09.pdf',
    ]);
    const bank = library.options[0];
    if (bank?.kind !== 'folder') throw new Error('expected folder');
    expect(bank.documents.map((d) => d.path)).toEqual(['Ally/2026-09.pdf', 'Chase/2026-09.pdf']);
    expect(bank.skipped).toEqual([{ path: 'account-summary.pdf', reason: 'different-level' }]);
    expect(bank.hasSubfolders).toBe(true);
  });

  it('is strict about uneven depths', () => {
    const library = libraryOf(['Taxes/Noah/2025/1040.pdf', 'Taxes/Anna/1040_2025.pdf']);
    const taxes = library.options[0];
    if (taxes?.kind !== 'folder') throw new Error('expected folder');
    expect(taxes.documents.map((d) => d.path)).toEqual(['Noah/2025/1040.pdf']);
    expect(taxes.skipped).toEqual([{ path: 'Anna/1040_2025.pdf', reason: 'different-level' }]);
  });

  it('measures depth using only files it can read', () => {
    const library = libraryOf(['ID/license.jpg', 'ID/old/notes/readme.txt']);
    const id = library.options[0];
    if (id?.kind !== 'folder') throw new Error('expected folder');
    expect(id.documents.map((d) => d.path)).toEqual(['license.jpg']);
    expect(id.skipped).toEqual([{ path: 'old/notes/readme.txt', reason: 'unsupported-type' }]);
  });

  it('orders files by subfolder, newest first, undated last', () => {
    const library = libraryOf([
      'Stubs/Noah/2026-08-01.pdf',
      'Stubs/Noah/notes.pdf',
      'Stubs/Noah/2026-09-01.pdf',
      'Stubs/Anna/2026-07-01.pdf',
    ]);
    const stubs = library.options[0];
    if (stubs?.kind !== 'folder') throw new Error('expected folder');
    expect(stubs.documents.map((d) => d.path)).toEqual([
      'Anna/2026-07-01.pdf',
      'Noah/2026-09-01.pdf',
      'Noah/2026-08-01.pdf',
      'Noah/notes.pdf',
    ]);
    expect(stubs.hasDates).toBe(true);
  });

  it('ignores hidden files and folders, and sets contact-info.txt aside', () => {
    const library = libraryOf([
      '.DS_Store',
      'contact-info.txt',
      'ID/._license.jpg',
      'ID/license.jpg',
      '.git/x.pdf',
      'ID/.cache/y.pdf',
    ]);
    expect(library.options.map((o) => o.title)).toEqual(['ID']);
    expect(library.contactFile).toBe('contact-info.txt');
    expect(library.ignored).toEqual([]);
  });

  it('finds the contact file regardless of case, only at the top level', () => {
    expect(libraryOf(['Contact-Info.TXT', 'a.pdf']).contactFile).toBe('Contact-Info.TXT');
    expect(libraryOf(['Misc/contact-info.txt', 'a.pdf']).contactFile).toBeNull();
  });

  it('reports top-level items it cannot use', () => {
    const library = libraryOf(['notes.docx', 'Old/readme.txt', 'Cover.pdf']);
    expect(library.options.map((o) => o.title)).toEqual(['Cover']);
    expect(library.ignored).toEqual([
      { path: 'notes.docx', reason: 'unsupported-type' },
      { path: 'Old/', reason: 'no-usable-files' },
    ]);
  });

  it('returns an empty library for no files', () => {
    expect(libraryOf([])).toEqual({ options: [], ignored: [], contactFile: null });
  });
});
