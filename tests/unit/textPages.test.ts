import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPacket } from '../../src/pdf/buildPacket';
import { countLinesPerPage, decodeText, paginate, splitTextLines, wrapLines } from '../../src/pdf/textPages';
import { samplePdf } from '../../scripts/lib/sampleDocs';
import { readPdf } from '../support/pdfText';

let font: PDFFont;
beforeAll(async () => {
  font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
});

const cover = { address: '', applicants: [], footerText: '', preparedOn: { year: 2026, month: 10, day: 4 } };
const textDoc = (text: string) => ({ label: 'note.txt', kind: 'text' as const, bytes: new TextEncoder().encode(text) });

describe('decodeText', () => {
  it('reads UTF-8, with or without a byte order mark', () => {
    expect(decodeText(new TextEncoder().encode('Zoë · café'))).toBe('Zoë · café');
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
  });

  it('reads UTF-16 with a byte order mark, either way round', () => {
    const little = new Uint8Array([0xff, 0xfe, 0x5a, 0x00, 0xeb, 0x00]);
    const big = new Uint8Array([0xfe, 0xff, 0x00, 0x5a, 0x00, 0xeb]);
    expect(decodeText(little)).toBe('Zë');
    expect(decodeText(big)).toBe('Zë');
  });

  // Node's decoder reads Windows-1252's 0x80–0x9F (curly quotes, dashes) as Latin-1 control
  // characters, unlike browsers, so these tests stick to accented letters.
  it('reads anything else as Windows-1252, as older Notepad saved it', () => {
    const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x20, 0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]);
    expect(decodeText(bytes)).toBe('café Müller');
  });
});

describe('splitTextLines', () => {
  it('splits any line ending, expands tabs and keeps indentation', () => {
    expect(splitTextLines('  first\r\nsecond\rthird\n\tfourth')).toEqual(['  first', 'second', 'third', '    fourth']);
  });

  it('drops blank lines at the start and end only', () => {
    expect(splitTextLines('\n  \nfirst\n\nlast\n \n')).toEqual(['first', '', 'last']);
    expect(splitTextLines(' \n\t\n')).toEqual([]);
  });
});

describe('wrapLines', () => {
  it('wraps at spaces to fit the width and keeps blank lines', () => {
    const lines = wrapLines(['one two three four five six', '', 'seven'], font, 12, 80);
    expect(lines.every((line) => font.widthOfTextAtSize(line, 12) <= 80)).toBe(true);
    expect(lines.join(' ').replace(/\s+/g, ' ')).toBe('one two three four five six seven');
    expect(lines).toContain('');
  });

  it('keeps indentation and runs of spaces in lines that fit', () => {
    const table = ['Item        Amount', '    Rent    $2,400', '    Deposit $2,400'];
    expect(wrapLines(table, font, 12, 400)).toEqual(table);
  });

  it('breaks long lines only at spaces, keeping the spacing within each part', () => {
    const lines = wrapLines(['  alpha  beta  gamma  delta  epsilon'], font, 12, 100);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]?.startsWith('  alpha  ')).toBe(true);
    expect(lines.every((line) => font.widthOfTextAtSize(line, 12) <= 100)).toBe(true);
    expect(lines.join(' ').trim().split(/ +/)).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
  });

  it('splits words longer than a line', () => {
    const lines = wrapLines(['x'.repeat(200), 'after'], font, 12, 100);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((line) => font.widthOfTextAtSize(line, 12) <= 100)).toBe(true);
    expect(lines.at(-1)).toBe('after');
  });

  it("adds no blank line when only the spaces at the end of a line don't fit", () => {
    const width = font.widthOfTextAtSize('Alex Sample', 12);
    expect(wrapLines(['Alex Sample ', 'next'], font, 12, width)).toEqual(['Alex Sample', 'next']);
    expect(wrapLines(['Alex Sample   Jordan'], font, 12, width)).toEqual(['Alex Sample', 'Jordan']);
  });
});

describe('paginate', () => {
  it('splits lines into full pages', () => {
    const perPage = countLinesPerPage();
    const lines = Array.from({ length: perPage * 2 + 1 }, (_, i) => `line ${i}`);
    expect(paginate(lines).map((page) => page.length)).toEqual([perPage, perPage, 1]);
  });
});

describe('text documents in a packet', () => {
  it('lays text out on as many pages as it needs, keeping paragraphs', async () => {
    const long = Array.from({ length: 120 }, (_, i) => `Paragraph ${i + 1}.`).join('\n');
    const packet = await buildPacket(cover, [{ title: 'Note', description: null, documents: [textDoc(long)] }]);
    const pdf = await readPdf(packet.bytes);
    expect(pdf.pages.length).toBeGreaterThan(2);
    expect(pdf.pages[1]).toMatch(/^Paragraph 1\. Paragraph 2\./);
    expect(pdf.pages[0]).toMatch(/CONTENTS Note 2/);
  });

  it('numbers the next section after every page of a long text file', async () => {
    const threePages = Array.from({ length: countLinesPerPage() * 2 + 1 }, (_, i) => `Line ${i + 1}`).join('\n');
    const after = { label: 'after.pdf', kind: 'pdf' as const, bytes: await samplePdf('after', []) };
    const packet = await buildPacket(cover, [
      { title: 'Note', description: null, documents: [textDoc(threePages)] },
      { title: 'After', description: null, documents: [after] },
    ]);
    const pdf = await readPdf(packet.bytes);
    expect(pdf.pages).toHaveLength(5);
    expect(pdf.pages[0]).toMatch(/CONTENTS Note 2 After 5/);
    expect(pdf.pages[4]).toContain('after');
    expect(pdf.links[0]).toEqual([1, 4]);
  });

  it('draws characters the font lacks as close equivalents', async () => {
    const packet = await buildPacket(cover, [
      { title: 'Note', description: null, documents: [textDoc('Łódź 🙂 café')] },
    ]);
    expect((await readPdf(packet.bytes)).pages[1]).toContain('Lódz ? café');
  });

  it('reads a Windows-1252 text file without replacement characters', async () => {
    const bytes = new Uint8Array([0x4a, 0x6f, 0x73, 0xe9, 0x20, 0xb7, 0x20, 0x63, 0x61, 0x66, 0xe9]); // "José · café"
    const packet = await buildPacket(cover, [
      { title: 'Note', description: null, documents: [{ label: 'old.txt', kind: 'text', bytes }] },
    ]);
    expect((await readPdf(packet.bytes)).pages[1]).toContain('José · café');
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
