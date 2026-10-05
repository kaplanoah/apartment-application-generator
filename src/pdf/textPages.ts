import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import { LETTER } from './geometry';

/** Plain-text files are laid out on letter pages with generous margins. */
export const TEXT_LAYOUT = {
  margin: 72,
  bottom: 64, // keeps clear of the footer
  size: 11,
  leading: 15.5,
} as const;

const TAB = '    ';

/** Number of text lines that fit on one page. */
export function linesPerPage(): number {
  return Math.floor((LETTER.height - TEXT_LAYOUT.margin - TEXT_LAYOUT.bottom) / TEXT_LAYOUT.leading);
}

/**
 * Breaks text into lines that fit `width`: wraps at spaces, splits words too
 * long for a line, and keeps blank lines. Text must already be drawable by
 * `font` (see makeTextSanitizer).
 */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const fits = (line: string) => font.widthOfTextAtSize(line, size) <= width;
  const lines: string[] = [];

  for (const paragraph of text.replace(/\r\n?/g, '\n').replace(/\t/g, TAB).split('\n')) {
    let current = '';
    for (const word of paragraph.split(' ').filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate)) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = '';
      for (const char of word) {
        if (current && !fits(current + char)) {
          lines.push(current);
          current = '';
        }
        current += char;
      }
    }
    lines.push(current);
  }
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  return lines;
}

/** Splits wrapped lines into pages. */
export function paginate(lines: readonly string[], perPage = linesPerPage()): string[][] {
  const pages: string[][] = [];
  for (let start = 0; start < lines.length; start += perPage) pages.push(lines.slice(start, start + perPage));
  return pages;
}

/** Draws pre-paginated text and returns the first new page. */
export function drawTextPages(doc: PDFDocument, font: PDFFont, pages: readonly (readonly string[])[]): PDFPage {
  let first: PDFPage | undefined;
  for (const lines of pages) {
    const page = doc.addPage([LETTER.width, LETTER.height]);
    first ??= page;
    lines.forEach((line, i) => {
      if (!line) return;
      page.drawText(line, {
        x: TEXT_LAYOUT.margin,
        y: LETTER.height - TEXT_LAYOUT.margin - TEXT_LAYOUT.size - i * TEXT_LAYOUT.leading,
        size: TEXT_LAYOUT.size,
        font,
        color: rgb(0.11, 0.13, 0.19),
      });
    });
  }
  return first as PDFPage;
}
