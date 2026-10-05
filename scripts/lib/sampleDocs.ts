/**
 * Generates fake documents for the example folder and the tests. Everything
 * is clearly marked SAMPLE and contains no real personal data.
 */
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { degrees, PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

export interface SamplePdfOptions {
  readonly pages?: number;
  readonly rotate?: number;
  readonly size?: readonly [number, number];
}

/** A small PDF with a few lines of text on each page. */
export async function samplePdf(
  title: string,
  lines: readonly string[] = [],
  options: SamplePdfOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.setProducer('sample');
  doc.setCreator('sample');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [width, height] = options.size ?? [612, 792];

  for (let i = 0; i < (options.pages ?? 1); i++) {
    const page = doc.addPage([width, height]);
    if (options.rotate) page.setRotation(degrees(options.rotate));
    page.drawText('SAMPLE — NOT A REAL DOCUMENT', { x: 50, y: height - 40, size: 9, font, color: rgb(0.7, 0.2, 0.2) });
    page.drawText(title, { x: 50, y: height - 80, size: 20, font: bold });
    lines.forEach((line, n) => page.drawText(line, { x: 50, y: height - 115 - n * 18, size: 12, font }));
    if ((options.pages ?? 1) > 1) page.drawText(`Page ${i + 1}`, { x: 50, y: 60, size: 10, font });
  }
  return doc.save();
}

/** A PDF that claims to be encrypted, like a locked bank statement. */
export async function encryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: 'Standard', V: 1, R: 2 }));
  return doc.save({ useObjectStreams: false });
}

/** Minimal PNG encoder for solid-color test images. */
export function samplePng(width: number, height: number, [r, g, b]: readonly [number, number, number]): Uint8Array {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', deflateSync(raw)),
      pngChunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** The fake ID-card photo in tests/fixtures (1000×630 JPEG). */
export function sampleIdJpeg(): Uint8Array {
  return new Uint8Array(readFileSync(new URL('../../tests/fixtures/sample-id.jpg', import.meta.url)));
}

/** Inserts an EXIF block with the given orientation right after the JPEG's SOI marker. */
export function withExifOrientation(jpeg: Uint8Array, orientation: number, littleEndian = false): Uint8Array {
  const tiff = Buffer.alloc(26);
  if (littleEndian) {
    tiff.write('II', 0, 'ascii');
    tiff.writeUInt16LE(42, 2);
    tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(1, 8);
    tiff.writeUInt16LE(0x0112, 10);
    tiff.writeUInt16LE(3, 12);
    tiff.writeUInt32LE(1, 14);
    tiff.writeUInt16LE(orientation, 18);
  } else {
    tiff.write('MM', 0, 'ascii');
    tiff.writeUInt16BE(42, 2);
    tiff.writeUInt32BE(8, 4);
    tiff.writeUInt16BE(1, 8);
    tiff.writeUInt16BE(0x0112, 10);
    tiff.writeUInt16BE(3, 12);
    tiff.writeUInt32BE(1, 14);
    tiff.writeUInt16BE(orientation, 18);
  }
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return new Uint8Array(
    Buffer.concat([Buffer.from(jpeg.subarray(0, 2)), header, payload, Buffer.from(jpeg.subarray(2))]),
  );
}

const SAMPLE_CONTACT_INFO = `# Sample contact info. Replace with your own.
Name: Alex Sample
Email: alex@example.com
Phone: (555) 010-2481

Name: Jordan Sample
Email: jordan@example.com
Phone: (555) 010-7730
`;

const SAMPLE_NOTE = `Hello,

Thank you for considering our application. We are both non-smokers, we have one small dog (Biscuit, vaccination record attached), and we are flexible on the move-in date.

Best,
Alex & Jordan
`;

/** Every file of the example folder, by path relative to the folder. */
export async function sampleFolderFiles(): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const add = async (path: string, title: string, lines: string[] = [], options?: SamplePdfOptions) =>
    files.set(path, await samplePdf(title, lines, options));

  files.set('contact-info.txt', new TextEncoder().encode(SAMPLE_CONTACT_INFO));
  await add('Cover Letter.pdf', 'Cover Letter', ['To whom it may concern,', 'We would love to rent your apartment.']);
  // The original the PDF was exported from: skipped quietly because the PDF sits beside it.
  files.set('Cover Letter.pages', new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
  files.set('Note to Landlord.txt', new TextEncoder().encode(SAMPLE_NOTE));
  await add('Landlord Reference.pdf', 'Landlord Reference', ['Alex and Jordan were wonderful tenants.']);
  files.set('ID/alex-id.jpg', sampleIdJpeg());
  await add('ID/jordan-passport.pdf', 'Passport (sample)', ['Jordan Sample']);
  await add('Employment Letters/Alex/offer-letter.pdf', 'Offer Letter', ['Alex Sample — Example Corp']);
  await add('Employment Letters/Jordan/employment-verification.pdf', 'Employment Verification', [
    'Jordan Sample — Sample LLC',
  ]);

  for (const date of ['2026-07-24', '2026-08-07', '2026-08-21', '2026-09-04', '2026-09-18', '2026-10-02']) {
    await add(`Pay Stubs/Alex/${date}.pdf`, `Pay Stub ${date}`, ['Alex Sample', 'Gross pay: $0.00 (sample)']);
  }
  for (const date of ['2026-07-31', '2026-08-15', '2026-08-31', '2026-09-15', '2026-09-30']) {
    await add(`Pay Stubs/Jordan/jordan_${date}.pdf`, `Pay Stub ${date}`, ['Jordan Sample', 'Net pay: $0.00 (sample)']);
  }
  for (const year of ['2023', '2024', '2025']) await add(`W-2s/Alex/w2_${year}.pdf`, `W-2 ${year}`, ['Alex Sample']);
  for (const year of ['2024', '2025']) await add(`W-2s/Jordan/w2_${year}.pdf`, `W-2 ${year}`, ['Jordan Sample']);
  for (const year of ['2024', '2025']) {
    await add(`Tax Returns/Alex/alex_${year}_1040.pdf`, `Form 1040 ${year}`, ['Alex Sample'], { pages: 2 });
    await add(`Tax Returns/Jordan/jordan_${year}_1040.pdf`, `Form 1040 ${year}`, ['Jordan Sample'], { pages: 2 });
  }
  for (const month of ['2026-06', '2026-07', '2026-08', '2026-09']) {
    await add(`Bank Statements/Chase/${month}.pdf`, `Checking Statement ${month}`, ['Alex Sample'], { pages: 2 });
  }
  for (const month of ['2026-07', '2026-08', '2026-09']) {
    await add(`Bank Statements/Ally/${month}.pdf`, `Savings Statement ${month}`, ['Jordan Sample']);
  }
  await add('Bank Statements/account-summary.pdf', 'Account Summary', ['Sits one level up, so it is skipped.']);
  for (const month of ['2026-06', '2026-07', '2026-08', '2026-09']) {
    await add(`Utility Bills/coned_${month}.pdf`, `Electric Bill ${month}`, ['Alex & Jordan Sample']);
  }
  await add('Utility Bills/welcome-letter.pdf', 'Welcome Letter', [
    'Undated, so it is left out when a date range is on.',
  ]);
  await add('Pets/biscuit-vaccines.pdf', 'Vaccination Record', ['Biscuit (sample dog)']);
  return files;
}

export async function writeFiles(root: string, files: ReadonlyMap<string, Uint8Array>): Promise<void> {
  for (const [path, bytes] of files) {
    const target = join(root, ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}
