import { buildLibrary, type FolderOption, type Library, type SourceEntry } from '../../src/core/library';

/** Builds a library from plain paths; each file is just its own path string. */
export function libraryOf(paths: readonly string[]): Library<string> {
  const entries: SourceEntry<string>[] = paths.map((path) => ({ path: path.split('/'), file: path }));
  return buildLibrary(entries);
}

export function folderOf(paths: readonly string[], name?: string): FolderOption<string> {
  const library = libraryOf(paths);
  const option = library.options.find((o) => o.kind === 'folder' && (!name || o.title === name));
  if (!option || option.kind !== 'folder') throw new Error('no folder option');
  return option;
}

export const TODAY = { year: 2026, month: 10, day: 4 } as const;
