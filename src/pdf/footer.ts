import { degrees, rgb, type PDFDocument, type PDFFont } from 'pdf-lib';
import { normalizeQuarterTurn, visibleSize, visibleToPage } from './geometry';
import { fitText } from './text';

const SIZE = 7.5;
const BASELINE = 20;
const COLOR = rgb(0.4, 0.42, 0.47);

/**
 * Writes the footer on every page, bottom-left, and "Page n of N" bottom-right.
 * Works for rotated and odd-sized pages by measuring from what the reader
 * actually sees.
 */
export function stampFooters(doc: PDFDocument, font: PDFFont, footerText: string): void {
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const box = page.getCropBox();
    const rotation = normalizeQuarterTurn(page.getRotation().angle);
    const visible = visibleSize(box, rotation);
    const margin = Math.min(36, visible.width * 0.06);

    const label = `Page ${index + 1} of ${pages.length}`;
    const labelWidth = font.widthOfTextAtSize(label, SIZE);
    const draw = (text: string, vx: number) => {
      const spot = visibleToPage(box, rotation, vx, BASELINE);
      page.drawText(text, { x: spot.x, y: spot.y, rotate: degrees(spot.rotate), size: SIZE, font, color: COLOR });
    };

    draw(label, visible.width - margin - labelWidth);
    const room = visible.width - 2 * margin - labelWidth - 18;
    if (footerText && room > 30) draw(fitText(footerText, font, SIZE, room), margin);
  });
}
