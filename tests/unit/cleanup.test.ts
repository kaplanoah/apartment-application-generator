import { PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildPacket } from '../../src/pdf/buildPacket';
import { cleanUpPacket } from '../../src/pdf/cleanup';
import { sampleIdJpeg } from '../../scripts/lib/sampleDocs';
import { readPdf } from '../support/pdfText';

const cover = { address: '', applicants: [], footerText: 'Footer', preparedOn: { year: 2026, month: 10, day: 4 } };

/** A "bank statement": the same logo image and font on every page, plus its month. */
async function statement(month: string, pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const logo = await doc.embedJpg(sampleIdJpeg());
  const font = await doc.embedFont(StandardFonts.Courier);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792]);
    page.drawImage(logo, { x: 36, y: 700, width: 120, height: 76 });
    page.drawText(`Statement ${month} page ${i + 1}`, { x: 36, y: 650, size: 12, font });
  }
  return doc.save();
}

const imageCount = (doc: PDFDocument) =>
  doc.context
    .enumerateIndirectObjects()
    .filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')).length;

describe('cleanUpPacket', () => {
  it('stores an image repeated across files once, without changing any page', async () => {
    const months = ['2026-07', '2026-08', '2026-09'];
    const documents = await Promise.all(
      months.map(async (month) => ({ label: `${month}.pdf`, kind: 'pdf' as const, bytes: await statement(month) })),
    );
    const packet = await buildPacket(cover, [{ title: 'Bank Statements', description: null, documents }]);

    const out = await PDFDocument.load(packet.bytes);
    expect(imageCount(out)).toBe(1);
    expect(packet.cleanupSavings).toBeGreaterThan(2 * sampleIdJpeg().byteLength * 0.9);

    const pdf = await readPdf(packet.bytes);
    expect(pdf.pages).toHaveLength(7);
    expect(pdf.pages[1]).toContain('Statement 2026-07 page 1');
    expect(pdf.pages[6]).toContain('Statement 2026-09 page 2');
    expect(pdf.pages[6]).toContain('Footer');
  });

  it('reports what each section takes up, counting a shared image once', async () => {
    const jpegBytes = sampleIdJpeg().byteLength;
    const statements = await Promise.all(
      ['2026-08', '2026-09'].map(async (month) => ({
        label: `${month}.pdf`,
        kind: 'pdf' as const,
        bytes: await statement(month),
      })),
    );
    const note = { label: 'note.txt', kind: 'text' as const, bytes: new TextEncoder().encode('Hello') };
    const packet = await buildPacket(cover, [
      { title: 'Bank Statements', description: null, documents: statements },
      { title: 'Note', description: null, documents: [note] },
      { title: 'More Statements', description: null, documents: [statements[0] as (typeof statements)[0]] },
    ]);

    const [bank, text, more] = packet.sectionBytes as [number, number, number];
    expect(bank).toBeGreaterThan(jpegBytes);
    expect(bank).toBeLessThan(jpegBytes * 1.5);
    expect(text).toBeLessThan(5000);
    expect(more).toBeLessThan(jpegBytes / 2); // its logo was already counted
    expect(bank + text + more).toBeLessThan(packet.bytes.byteLength * 1.2);
  });

  it('compresses streams that were saved uncompressed', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const text = new TextEncoder().encode('BT /F1 12 Tf 72 712 Td (repeat) Tj ET\n'.repeat(200));
    const ref = doc.context.register(doc.context.stream(text));
    const saved = cleanUpPacketKeeping(doc, ref);
    const stream = doc.context.lookup(ref) as PDFRawStream;
    expect(stream.dict.get(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'));
    expect(stream.contents.byteLength).toBeLessThan(text.byteLength / 5);
    expect(saved).toBeGreaterThan(0);
  });

  it('drops page thumbnails and anything left unreferenced', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const thumb = doc.context.register(doc.context.stream(new Uint8Array(4000).fill(7)));
    page.node.set(PDFName.of('Thumb'), thumb);
    const orphan = doc.context.register(doc.context.stream(new Uint8Array(4000).fill(9)));

    cleanUpPacket(doc);
    expect(page.node.get(PDFName.of('Thumb'))).toBeUndefined();
    expect(doc.context.lookup(thumb)).toBeUndefined();
    expect(doc.context.lookup(orphan)).toBeUndefined();
    expect(doc.getPageCount()).toBe(1);
  });
});

/** Runs the clean-up while the stream is still referenced from the page, so it survives. */
function cleanUpPacketKeeping(doc: PDFDocument, ref: ReturnType<PDFDocument['context']['register']>): number {
  doc.getPage(0).node.set(PDFName.of('Contents'), ref);
  return cleanUpPacket(doc);
}
