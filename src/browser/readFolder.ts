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
