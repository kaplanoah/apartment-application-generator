export type DocumentKind = 'pdf' | 'image';

const KIND_BY_EXTENSION: Readonly<Record<string, DocumentKind>> = {
  pdf: 'pdf',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  heic: 'image',
  heif: 'image',
  webp: 'image',
};

/** File names the operating system creates that should never be shown. */
const SYSTEM_NAMES = new Set(['icon\r', 'thumbs.db', 'desktop.ini', '__macosx']);

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** The kind of document a file is, or null if the app can't use it. */
export function documentKindOf(fileName: string): DocumentKind | null {
  return KIND_BY_EXTENSION[extensionOf(fileName)] ?? null;
}

/** Hidden and system files (".DS_Store", "._photo.jpg", "Thumbs.db", …). */
export function isHiddenName(name: string): boolean {
  return name.startsWith('.') || name.startsWith('~$') || SYSTEM_NAMES.has(name.toLowerCase());
}

export const SUPPORTED_EXTENSIONS: readonly string[] = Object.keys(KIND_BY_EXTENSION);
