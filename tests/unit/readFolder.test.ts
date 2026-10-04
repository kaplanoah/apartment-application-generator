import { describe, expect, it } from 'vitest';
import { UserFacingError } from '../../src/core/errors';
import { folderFromDrop, folderFromInput, MAX_FILES } from '../../src/browser/readFolder';

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

// Minimal stand-ins for the browser's drag-and-drop file system entries.
type FakeEntry = { name: string; isDirectory: boolean; isFile: boolean; [key: string]: unknown };
const fileEntry = (name: string, fail = false): FakeEntry => ({
  name,
  isDirectory: false,
  isFile: true,
  file: (resolve: (f: File) => void, reject: (e: Error) => void) =>
    fail ? reject(new Error('gone')) : resolve(new File(['x'], name)),
});
const dirEntry = (name: string, children: FakeEntry[], batch = 2): FakeEntry => ({
  name,
  isDirectory: true,
  isFile: false,
  createReader: () => {
    let offset = 0;
    return {
      readEntries: (resolve: (entries: FakeEntry[]) => void) => {
        resolve(children.slice(offset, offset + batch));
        offset += batch;
      },
    };
  },
});
const dropOf = (...entries: (FakeEntry | null)[]) =>
  ({ items: entries.map((entry) => ({ kind: 'file', webkitGetAsEntry: () => entry })) }) as unknown as DataTransfer;

describe('folderFromDrop', () => {
  it('reads nested folders, including directories returned in batches', async () => {
    const root = dirEntry('Docs', [
      fileEntry('a.pdf'),
      dirEntry('Stubs', [fileEntry('1.pdf'), fileEntry('2.pdf'), fileEntry('3.pdf')]),
      fileEntry('b.pdf'),
    ]);
    const folder = await folderFromDrop(dropOf(root));
    expect(folder.name).toBe('Docs');
    expect(folder.entries.map((e) => e.path.join('/'))).toEqual([
      'a.pdf',
      'Stubs/1.pdf',
      'Stubs/2.pdf',
      'Stubs/3.pdf',
      'b.pdf',
    ]);
  });

  it('explains what to drop instead', async () => {
    await expect(folderFromDrop(dropOf())).rejects.toThrow(/Drop a folder here/);
    await expect(folderFromDrop(dropOf(dirEntry('A', []), dirEntry('B', [])))).rejects.toThrow(/just one folder/);
    await expect(folderFromDrop(dropOf(fileEntry('a.pdf')))).rejects.toThrow(/That’s a file/);
    await expect(folderFromDrop(dropOf(dirEntry('Empty', [])))).rejects.toThrow(/empty/);
  });

  it('lists files that could not be read, such as iCloud placeholders', async () => {
    const error = await folderFromDrop(
      dropOf(dirEntry('Docs', [fileEntry('ok.pdf'), fileEntry('cloud.pdf', true)])),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UserFacingError);
    expect((error as UserFacingError).details).toEqual(['cloud.pdf']);
  });
});
