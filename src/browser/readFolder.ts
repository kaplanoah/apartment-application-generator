import { UserFacingError } from '../core/errors';
import type { SourceEntry } from '../core/library';

export interface PickedFolder {
  readonly name: string;
  readonly entries: readonly SourceEntry<File>[];
}

/** Guards against picking a huge folder like Documents by mistake. */
export const MAX_FILES = 2000;

const TOO_MANY = `This folder has more than ${MAX_FILES.toLocaleString('en-US')} files. Choose the folder that holds just your application documents.`;
const EMPTY = 'That folder is empty. Choose the folder that holds your documents.';
const DRAG_FAILED =
  'The browser couldn’t read everything you dragged in. Click “Choose folder…” and pick the same folder instead. If that also fails, check these have finished downloading from iCloud:';

/** Reads the files chosen with <input type="file" webkitdirectory>. */
export function folderFromInput(files: ArrayLike<File>): PickedFolder {
  const list = Array.from(files);
  if (list.length === 0) throw new UserFacingError(EMPTY);
  if (list.length > MAX_FILES) throw new UserFacingError(TOO_MANY);

  const entries: SourceEntry<File>[] = [];
  let name = '';
  for (const file of list) {
    const parts = (file.webkitRelativePath || '').split('/').filter(Boolean);
    if (parts.length < 2) throw new UserFacingError('Choose a folder rather than individual files.');
    name ||= parts[0] ?? '';
    entries.push({ path: parts.slice(1), file });
  }
  return { name, entries };
}

/**
 * Reads a folder dragged onto the page. Must be called synchronously from the
 * drop handler: the browser empties the DataTransfer once the handler returns.
 */
export function folderFromDrop(dataTransfer: DataTransfer): Promise<PickedFolder> {
  const roots = Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry());

  if (roots.length === 0) return Promise.reject(new UserFacingError('Drop a folder here, such as “Apartment Docs”.'));
  if (roots.length > 1) {
    return Promise.reject(new UserFacingError('Drop just one folder: the one that holds all your documents.'));
  }
  const root = roots[0];
  if (!root || !root.isDirectory) {
    return Promise.reject(new UserFacingError('That’s a file. Drop the folder that holds your documents instead.'));
  }
  return readDirectory(root as FileSystemDirectoryEntry);
}

async function readDirectory(root: FileSystemDirectoryEntry): Promise<PickedFolder> {
  const entries: SourceEntry<File>[] = [];
  const unreadable: string[] = [];

  async function walk(directory: FileSystemDirectoryEntry, path: string[]): Promise<void> {
    let children: FileSystemEntry[];
    try {
      children = await readAllChildren(directory);
    } catch {
      // Safari's drag-and-drop reader fails on some folders (for example
      // certain characters in names). Note it and keep reading the rest.
      unreadable.push(path.length > 0 ? `${path.join('/')}/` : `${root.name}/`);
      return;
    }
    for (const child of children) {
      const childPath = [...path, child.name];
      if (child.isDirectory) {
        await walk(child as FileSystemDirectoryEntry, childPath);
      } else {
        try {
          entries.push({ path: childPath, file: await fileOf(child as FileSystemFileEntry) });
        } catch {
          unreadable.push(childPath.join('/'));
        }
      }
      if (entries.length > MAX_FILES) throw new UserFacingError(TOO_MANY);
    }
  }

  await walk(root, []);
  if (unreadable.length > 0) throw new UserFacingError(DRAG_FAILED, unreadable);
  if (entries.length === 0) throw new UserFacingError(EMPTY);
  return { name: root.name, entries };
}

/** readEntries returns results in batches; keep asking until it's empty. */
async function readAllChildren(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

const fileOf = (entry: FileSystemFileEntry): Promise<File> =>
  new Promise((resolve, reject) => entry.file(resolve, reject));
