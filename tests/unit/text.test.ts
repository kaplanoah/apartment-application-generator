import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PDFFont } from 'pdf-lib';
import { fitText, makeTextSanitizer } from '../../src/pdf/text';

let font: PDFFont;
beforeAll(async () => {
  font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
});

describe('text helpers', () => {
  it('keeps Western characters and replaces what the font cannot draw', () => {
    const sanitize = makeTextSanitizer(font);
    expect(sanitize('José Müller · Apt 4B – “Loft”')).toBe('José Müller · Apt 4B – “Loft”');
    expect(sanitize('Łukasz 李 🏠')).toBe('Lukasz ? ?');
    expect(sanitize('line\nbreak\ttab')).toBe('line break tab');
    expect(() => font.encodeText(sanitize('Zoë 🙂 Ωmega'))).not.toThrow();
  });

  it('shortens text with an ellipsis to fit', () => {
    const long = 'A very long folder name that will not fit on one line at all';
    const fitted = fitText(long, font, 12, 100);
    expect(fitted.endsWith('…')).toBe(true);
    expect(font.widthOfTextAtSize(fitted, 12)).toBeLessThanOrEqual(100);
    expect(fitText('Short', font, 12, 100)).toBe('Short');
    expect(fitText('Anything', font, 12, 1)).toBe('…');
  });
});
