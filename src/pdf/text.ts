import { rgb, type PDFFont } from 'pdf-lib';

/** The color of all body text in the packet. */
export const INK = rgb(0.11, 0.13, 0.19);

/** Letters that don't decompose into a base letter plus accent. */
const LETTER_FALLBACKS: Readonly<Record<string, string>> = {
  Ł: 'L',
  ł: 'l',
  Đ: 'D',
  đ: 'd',
  Ħ: 'H',
  ħ: 'h',
  ı: 'i',
  Ŧ: 'T',
  ŧ: 't',
};

/**
 * The built-in PDF fonts only cover Western European characters. Anything
 * else (emoji, other scripts) would make pdf-lib throw, so it's swapped for
 * a close equivalent or "?".
 */
export function makeTextSanitizer(font: PDFFont): (text: string) => string {
  const supported = new Set(font.getCharacterSet());
  return (text) =>
    Array.from(text.normalize('NFC').replace(/[\r\n\t]+/g, ' '), (char) => {
      const code = char.codePointAt(0) ?? 0;
      if (supported.has(code)) return char;
      const fallback = LETTER_FALLBACKS[char] ?? char.normalize('NFD').replace(/\p{M}/gu, '');
      return fallback.length === 1 && supported.has(fallback.codePointAt(0) ?? 0) ? fallback : '?';
    }).join('');
}

/** Shortens text with an ellipsis so it fits within `maxWidth`. */
export function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = '…';
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = text.slice(0, mid).trimEnd() + ellipsis;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low === 0 ? ellipsis : text.slice(0, low).trimEnd() + ellipsis;
}
