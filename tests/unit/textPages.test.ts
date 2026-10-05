import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPacket } from '../../src/pdf/buildPacket';
import { linesPerPage, paginate, wrapText } from '../../src/pdf/textPages';
import { readPdf } from '../support/pdfText';

let font: PDFFont;
beforeAll(async () => {
  font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
});

const cover = { address: '', applicants: [], footerText: '', preparedOn: { year: 2026, month: 10, day: 4 } };
const textDoc = (text: string) => ({ label: 'note.txt', kind: 'text' as const, bytes: new TextEncoder().encode(text) });

describe('wrapText', () => {
  it('wraps at spaces to fit the width and keeps blank lines', () => {
    const lines = wrapText('one two three four five six\n\nseven', font, 12, 80);
    expect(lines.every((line) => font.widthOfTextAtSize(line, 12) <= 80)).toBe(true);
    expect(lines.join(' ').replace(/\s+/g, ' ')).toBe('one two three four five six seven');
    expect(lines).toContain('');
  });

  it('splits words longer than a line and handles tabs and Windows line endings', () => {
    const lines = wrapText('x'.repeat(200) + '\r\n\ttabbed', font, 12, 100);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((line) => font.widthOfTextAtSize(line, 12) <= 100)).toBe(true);
    expect(lines.at(-1)).toBe('tabbed');
  });

  it('drops trailing blank lines', () => {
    expect(wrapText('a\n\n\n', font, 12, 100)).toEqual(['a']);
  });
});

describe('paginate', () => {
  it('splits lines into full pages', () => {
    const lines = Array.from({ length: linesPerPage() * 2 + 1 }, (_, i) => `line ${i}`);
    expect(paginate(lines).map((page) => page.length)).toEqual([linesPerPage(), linesPerPage(), 1]);
  });
});

describe('text documents in a packet', () => {
  it('lays text out on as many pages as it needs, keeping paragraphs', async () => {
    const long = Array.from({ length: 120 }, (_, i) => `Paragraph ${i + 1}.`).join('\n');
    const packet = await buildPacket(cover, [{ title: 'Note', description: null, documents: [textDoc(long)] }]);
    const pdf = await readPdf(packet.bytes);
    expect(pdf.pages.length).toBeGreaterThan(2);
    expect(pdf.pages[1]).toMatch(/^Paragraph 1\. Paragraph 2\./);
    expect(pdf.pages[0]).toMatch(/01 Note .*2/);
  });

  it('draws characters the font lacks as close equivalents', async () => {
    const packet = await buildPacket(cover, [
      { title: 'Note', description: null, documents: [textDoc('Łódź 🙂 café')] },
    ]);
    expect((await readPdf(packet.bytes)).pages[1]).toContain('Lódz ? café');
  });

  it('explains empty and oversized text files', async () => {
    const attempt = buildPacket(cover, [
      {
        title: 'Notes',
        description: null,
        documents: [
          textDoc('   \n  '),
          { ...textDoc(''), label: 'huge.txt', bytes: new Uint8Array(600 * 1024).fill(97) },
        ],
      },
    ]);
    await expect(attempt).rejects.toMatchObject({
      details: [
        'note.txt: the text file is empty.',
        'huge.txt: the text file is too long for the packet. Save it as a PDF instead.',
      ],
    });
  });
});
