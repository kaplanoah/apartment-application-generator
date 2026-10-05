import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { buildPacket } from '../../src/pdf/buildPacket';
import { shrinkPdfImages, type JpegShrinker } from '../../src/pdf/shrinkImages';
import { sampleIdJpeg, withExifOrientation } from '../../scripts/lib/sampleDocs';

/** A PDF with one page showing the given JPEG (the sample ID is 1000×630). */
async function pdfWithJpeg(jpeg: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const image = await doc.embedJpg(jpeg);
  doc.addPage([612, 792]).drawImage(image, { x: 36, y: 36, width: 540, height: 340 });
  return doc.save();
}

function imageStreams(doc: PDFDocument): PDFRawStream[] {
  return doc.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter(
      (object): object is PDFRawStream =>
        object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
    );
}

const width = (stream: PDFRawStream) => (stream.dict.get(PDFName.of('Width')) as PDFNumber).asNumber();

/** Stand-in for the browser's re-encoder: reports the scaled size and returns tiny bytes. */
const fakeShrinker: JpegShrinker = async (jpeg, maxEdge) => {
  const scale = maxEdge / 1000;
  return { bytes: jpeg.slice(0, 100), width: Math.round(1000 * scale), height: Math.round(630 * scale) };
};

describe('shrinkPdfImages', () => {
  it('replaces oversized JPEG images with smaller ones, updating their size', async () => {
    const doc = await PDFDocument.load(await pdfWithJpeg(sampleIdJpeg()));
    const before = imageStreams(doc)[0]!;
    const saved = await shrinkPdfImages(doc, { maxEdge: 500, quality: 0.8, shrink: fakeShrinker });

    const after = imageStreams(doc)[0]!;
    expect(width(before)).toBe(1000);
    expect(width(after)).toBe(500);
    expect(after.contents.byteLength).toBe(100);
    expect(after.dict.get(PDFName.of('Length'))).toEqual(PDFNumber.of(100));
    expect(saved).toBe(before.contents.byteLength - 100);
  });

  it('leaves images alone when they are already small enough', async () => {
    const doc = await PDFDocument.load(await pdfWithJpeg(sampleIdJpeg()));
    const shrink = vi.fn(fakeShrinker);
    expect(await shrinkPdfImages(doc, { maxEdge: 1600, quality: 0.8, shrink })).toBe(0);
    expect(shrink).not.toHaveBeenCalled();
  });

  it('keeps the original if re-encoding would not make it smaller, or fails', async () => {
    const doc = await PDFDocument.load(await pdfWithJpeg(sampleIdJpeg()));
    const bigger: JpegShrinker = async (jpeg) => ({
      bytes: new Uint8Array(jpeg.byteLength + 1),
      width: 500,
      height: 315,
    });
    expect(await shrinkPdfImages(doc, { maxEdge: 500, quality: 0.8, shrink: bigger })).toBe(0);
    const failing: JpegShrinker = async () => {
      throw new Error('decode failed');
    };
    expect(await shrinkPdfImages(doc, { maxEdge: 500, quality: 0.8, shrink: failing })).toBe(0);
    expect(width(imageStreams(doc)[0]!)).toBe(1000);
  });

  it('skips JPEGs with a rotation tag, which PDF viewers ignore', async () => {
    const doc = await PDFDocument.load(await pdfWithJpeg(withExifOrientation(sampleIdJpeg(), 6)));
    const shrink = vi.fn(fakeShrinker);
    expect(await shrinkPdfImages(doc, { maxEdge: 500, quality: 0.8, shrink })).toBe(0);
    expect(shrink).not.toHaveBeenCalled();
  });

  it('is applied to PDFs in a packet when limits are given', async () => {
    const source = await pdfWithJpeg(sampleIdJpeg());
    const sections = [
      { title: 'ID', description: null, documents: [{ label: 'id.pdf', kind: 'pdf' as const, bytes: source }] },
    ];
    const cover = { address: '', applicants: [], footerText: '', preparedOn: { year: 2026, month: 10, day: 4 } };
    const kept = await buildPacket(cover, sections);
    const shrunk = await buildPacket(cover, sections, {
      imageLimits: { maxEdge: 500, quality: 0.8, shrink: fakeShrinker },
    });
    expect(shrunk.bytes.byteLength).toBeLessThan(kept.bytes.byteLength - 20_000);
    const out = await PDFDocument.load(shrunk.bytes);
    expect(imageStreams(out).map(width)).toEqual([500]);
  });
});
