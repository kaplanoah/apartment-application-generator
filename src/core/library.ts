import { CONTACT_FILE_NAME } from './contactInfo';
import { parseFileDate, type FileDate } from './fileDate';
import { documentKindOf, exportStepsFor, isHiddenName, stripExtension, type DocumentKind } from './fileTypes';

/** A file found in the chosen folder. `path` is relative to that folder. */
export interface SourceEntry<F> {
  readonly path: readonly string[];
  readonly file: F;
}

export interface LibraryDocument<F> {
  /** Path inside its top-level option, e.g. "Alex/2026-09-18.pdf". */
  readonly path: string;
  /** Subfolder path inside the option, "" when the file sits directly in it. */
  readonly subfolder: string;
  readonly name: string;
  readonly kind: DocumentKind;
  readonly date: FileDate | null;
  readonly file: F;
}

type SkipReason = 'different-level' | 'unsupported-type' | 'needs-pdf';

export interface SkippedFile {
  readonly path: string;
  readonly reason: SkipReason;
  /** For 'needs-pdf': how to save the file as a PDF. */
  readonly exportSteps?: string;
}

export interface FolderOption<F> {
  readonly kind: 'folder';
  readonly id: string;
  readonly title: string;
  /** Usable files at the folder's deepest level, in display order. */
  readonly documents: readonly LibraryDocument<F>[];
  readonly skipped: readonly SkippedFile[];
  readonly hasDates: boolean;
  readonly hasSubfolders: boolean;
}

interface FileOption<F> {
  readonly kind: 'file';
  readonly id: string;
  readonly title: string;
  readonly document: LibraryDocument<F>;
}

export type LibraryOption<F> = FolderOption<F> | FileOption<F>;

interface IgnoredItem {
  readonly path: string;
  readonly reason: 'unsupported-type' | 'no-usable-files' | 'needs-pdf';
  /** For 'needs-pdf': how to save the file as a PDF. */
  readonly exportSteps?: string;
}

export interface Library<F> {
  /** What can be dragged into the packet, sorted by name. */
  readonly options: readonly LibraryOption<F>[];
  /** Top-level items that can't be used, so the UI can say why. */
  readonly ignored: readonly IgnoredItem[];
  readonly contactFile: F | null;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const compareNames = (a: string, b: string): number => collator.compare(a, b);

/**
 * Turns the files of the chosen folder into packet options:
 *
 * - every top-level file the app can read is an option on its own;
 * - every top-level folder is an option made of the files at its *deepest*
 *   level only. Files at any other depth are skipped (and reported), so one
 *   option never mixes nesting levels;
 * - hidden/system files are ignored, and contact-info.txt is set aside;
 * - Word, Pages and similar files are reported with how to save them as PDF,
 *   unless a PDF with the same name already sits next to them.
 */
export function buildLibrary<F>(entries: readonly SourceEntry<F>[]): Library<F> {
  const options: LibraryOption<F>[] = [];
  const ignored: IgnoredItem[] = [];
  const folders = new Map<string, SourceEntry<F>[]>();
  let contactFile: F | null = null;

  const visible = entries.filter((entry) => entry.path.length > 0 && !entry.path.some(isHiddenName));
  const exported = exportedPdfKeys(visible);

  for (const entry of visible) {
    if (hasExportedCopy(entry.path, exported)) continue;
    const [top, ...rest] = entry.path as [string, ...string[]];

    if (rest.length === 0) {
      const exportSteps = exportStepsFor(top);
      if (top.toLowerCase() === CONTACT_FILE_NAME) {
        contactFile = entry.file;
      } else if (documentKindOf(top)) {
        options.push({ kind: 'file', id: top, title: stripExtension(top), document: toDocument([top], entry.file) });
      } else if (exportSteps) {
        ignored.push({ path: top, reason: 'needs-pdf', exportSteps });
      } else {
        ignored.push({ path: top, reason: 'unsupported-type' });
      }
      continue;
    }
    const list = folders.get(top) ?? [];
    list.push({ path: rest, file: entry.file });
    folders.set(top, list);
  }

  for (const [name, inner] of folders) {
    const option = buildFolderOption(name, inner);
    if (option) options.push(option);
    else ignored.push({ path: `${name}/`, reason: 'no-usable-files' });
  }

  options.sort((a, b) => compareNames(a.title, b.title));
  ignored.sort((a, b) => compareNames(a.path, b.path));
  return { options, ignored, contactFile };
}

function buildFolderOption<F>(name: string, entries: readonly SourceEntry<F>[]): FolderOption<F> | null {
  const usable = entries.filter((entry) => documentKindOf(entry.path.at(-1) ?? ''));
  if (usable.length === 0) return null;

  const deepest = Math.max(...usable.map((entry) => entry.path.length));
  const documents: LibraryDocument<F>[] = [];
  const skipped: SkippedFile[] = [];

  for (const entry of entries) {
    const path = entry.path.join('/');
    const name = entry.path.at(-1) ?? '';
    const exportSteps = exportStepsFor(name);
    if (exportSteps) skipped.push({ path, reason: 'needs-pdf', exportSteps });
    else if (!documentKindOf(name)) skipped.push({ path, reason: 'unsupported-type' });
    else if (entry.path.length !== deepest) skipped.push({ path, reason: 'different-level' });
    else documents.push(toDocument(entry.path, entry.file));
  }

  documents.sort(compareDocuments);
  skipped.sort((a, b) => compareNames(a.path, b.path));
  return {
    kind: 'folder',
    id: `${name}/`,
    title: name,
    documents,
    skipped,
    hasDates: documents.some((doc) => doc.date !== null),
    hasSubfolders: documents.some((doc) => doc.subfolder !== ''),
  };
}

/** "dir/name" (lower-case, no extension) of every PDF, to spot exported copies. */
function exportedPdfKeys<F>(entries: readonly SourceEntry<F>[]): Set<string> {
  const keys = new Set<string>();
  for (const entry of entries) {
    const name = entry.path.at(-1) ?? '';
    if (documentKindOf(name) === 'pdf') keys.add(copyKey(entry.path));
  }
  return keys;
}

/** True for a Word/Pages/… file that already has a PDF of the same name beside it. */
function hasExportedCopy(path: readonly string[], exported: ReadonlySet<string>): boolean {
  return exportStepsFor(path.at(-1) ?? '') !== null && exported.has(copyKey(path));
}

const copyKey = (path: readonly string[]): string =>
  [...path.slice(0, -1), stripExtension(path.at(-1) ?? '')].join('/').toLowerCase();

function toDocument<F>(path: readonly string[], file: F): LibraryDocument<F> {
  const name = path.at(-1) ?? '';
  return {
    path: path.join('/'),
    subfolder: path.slice(0, -1).join('/'),
    name,
    kind: documentKindOf(name) ?? 'pdf',
    date: parseFileDate(name),
    file,
  };
}

/** Grouped by subfolder, newest first, undated last, then by name. */
function compareDocuments<F>(a: LibraryDocument<F>, b: LibraryDocument<F>): number {
  const bySubfolder = compareNames(a.subfolder, b.subfolder);
  if (bySubfolder !== 0) return bySubfolder;
  if (a.date && b.date) {
    const byDate = dayKey(b.date) - dayKey(a.date);
    if (byDate !== 0) return byDate;
  } else if (a.date || b.date) {
    return a.date ? -1 : 1;
  }
  return compareNames(a.name, b.name);
}

const dayKey = (date: FileDate): number => date.start.year * 10_000 + date.start.month * 100 + date.start.day;
