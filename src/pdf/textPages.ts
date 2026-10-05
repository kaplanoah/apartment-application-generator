import type { PDFDocument, PDFFont } from 'pdf-lib';
import { LETTER } from './geometry';
import { INK } from './text';

/** Plain-text files are laid out on letter pages with generous margins. */
const TEXT_LAYOUT = {
  margin: 72,
  bottom: 64, // keeps clear of the footer
  size: 11,
  leading: 15.5,
} as const;

const TAB = '    ';

/** Number of text lines that fit on one page. */
export function countLinesPerPage(): number {
  return Math.floor((LETTER.height - TEXT_LAYOUT.margin - TEXT_LAYOUT.bottom) / TEXT_LAYOUT.leading);
}

/**
 * Reads a text file saved as UTF-8 (the usual), as UTF-16 with a byte order mark, or else as
 * Windows-1252, which older Notepad and Office versions save.
 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/**
 * Splits text into lines, expanding tabs and dropping blank lines at the start and end.
 * Indentation and runs of spaces are kept.
 */
export function splitTextLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/).map((line) => line.replace(/\t/g, TAB));
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first === -1) return [];
  const last = lines.findLastIndex((line) => line.trim() !== '');
  return lines.slice(first, last + 1);
}

/**
 * Breaks lines so each fits `width`: wraps at spaces, splits words too long for a line, and
 * keeps indentation and runs of spaces within a line. Lines must already be drawable by
 * `font` (see makeTextSanitizer).
 */
export function wrapLines(lines: readonly string[], font: PDFFont, size: number, width: number): string[] {
  const fits = (line: string) => font.widthOfTextAtSize(line, size) <= width;
  const wrapped: string[] = [];

  for (const line of lines) {
    let current = '';
    for (const piece of line.match(/ +|[^ ]+/g) ?? []) {
      if (fits(current + piece)) {
        current += piece;
        continue;
      }
      if (current.trim()) wrapped.push(current.trimEnd());
      current = '';
      if (piece.startsWith(' ')) continue; // the line break takes the place of the spaces
      for (const char of piece) {
        if (current && !fits(current + char)) {
          wrapped.push(current);
          current = '';
        }
        current += char;
      }
    }
    wrapped.push(current.trimEnd());
  }
  return wrapped;
}

/** Splits wrapped lines into pages. */
export function paginate(lines: readonly string[], perPage = countLinesPerPage()): string[][] {
  const pages: string[][] = [];
  for (let start = 0; start < lines.length; start += perPage) pages.push(lines.slice(start, start + perPage));
  return pages;
}

/**
 * Lays a text file out in pages of lines, or no pages when it's blank. `sanitize` makes a line
 * drawable by `font` (see makeTextSanitizer).
 */
export function layoutTextPages(text: string, font: PDFFont, sanitize: (line: string) => string): string[][] {
  // Sanitized line by line: the sanitizer flattens line breaks.
  const lines = splitTextLines(text).map(sanitize);
  return paginate(wrapLines(lines, font, TEXT_LAYOUT.size, LETTER.width - TEXT_LAYOUT.margin * 2));
}

/** Draws text laid out by layoutTextPages, one page per entry. */
export function drawTextPages(doc: PDFDocument, font: PDFFont, pages: readonly (readonly string[])[]): void {
  for (const lines of pages) {
    const page = doc.addPage([LETTER.width, LETTER.height]);
    lines.forEach((line, i) => {
      if (!line) return;
      page.drawText(line, {
        x: TEXT_LAYOUT.margin,
        y: LETTER.height - TEXT_LAYOUT.margin - TEXT_LAYOUT.size - i * TEXT_LAYOUT.leading,
        size: TEXT_LAYOUT.size,
        font,
        color: INK,
      });
    });
  }
}
