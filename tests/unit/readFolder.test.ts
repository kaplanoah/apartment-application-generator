import { describe, expect, it } from 'vitest';
import { folderFromInput, MAX_FILES } from '../../src/browser/readFolder';

const inputFile = (relativePath: string) =>
  ({ webkitRelativePath: relativePath, name: relativePath.split('/').at(-1) }) as unknown as File;

describe('folderFromInput', () => {
  it('strips the root folder name from each path', () => {
    const folder = folderFromInput([inputFile('Apartment Docs/ID/a.jpg'), inputFile('Apartment Docs/Cover.pdf')]);
    expect(folder.name).toBe('Apartment Docs');
    expect(folder.entries.map((e) => e.path)).toEqual([['ID', 'a.jpg'], ['Cover.pdf']]);
  });

  it('explains empty folders, loose files and huge folders', () => {
    expect(() => folderFromInput([])).toThrow(/empty/);
    expect(() => folderFromInput([inputFile('')])).toThrow(/folder rather than individual files/);
    const many = Array.from({ length: MAX_FILES + 1 }, (_, i) => inputFile(`Docs/${i}.pdf`));
    expect(() => folderFromInput(many)).toThrow(/more than 2,000 files/);
  });
});
