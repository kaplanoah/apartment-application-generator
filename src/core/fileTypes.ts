export type DocumentKind = 'pdf' | 'image' | 'text';

const KIND_BY_EXTENSION: Readonly<Record<string, DocumentKind>> = {
  pdf: 'pdf',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  heic: 'image',
  heif: 'image',
  webp: 'image',
  txt: 'text',
};

/**
 * Documents the app can't lay out faithfully, with how to save them as PDF.
 * (Word and Pages files can only be rendered properly by their own apps.)
 */
const EXPORT_STEPS: Readonly<Record<string, string>> = {
  pages: 'in Pages, choose File → Export To → PDF',
  numbers: 'in Numbers, choose File → Export To → PDF',
  key: 'in Keynote, choose File → Export To → PDF',
  doc: 'in Word, choose File → Save As and pick PDF',
  docx: 'in Word, choose File → Save As and pick PDF',
  xls: 'in Excel, choose File → Save As and pick PDF',
  xlsx: 'in Excel, choose File → Save As and pick PDF',
  ppt: 'in PowerPoint, choose File → Save As and pick PDF',
  pptx: 'in PowerPoint, choose File → Save As and pick PDF',
  rtf: 'in TextEdit, choose File → Export as PDF',
  odt: 'choose File → Export as PDF in the app that made it',
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

/** How to turn a Word/Pages/… file into a PDF, or null for other files. */
export function exportStepsFor(fileName: string): string | null {
  return EXPORT_STEPS[extensionOf(fileName)] ?? null;
}

/** Hidden and system files (".DS_Store", "._photo.jpg", "Thumbs.db", …). */
export function isHiddenName(name: string): boolean {
  return name.startsWith('.') || name.startsWith('~$') || SYSTEM_NAMES.has(name.toLowerCase());
}
