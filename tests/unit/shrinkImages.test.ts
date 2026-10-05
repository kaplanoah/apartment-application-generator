import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, type PDFRef } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { buildPacket } from '../../src/pdf/buildPacket';
import { readJpegOrientation } from '../../src/pdf/exif';
import { shrinkPdfImages, type ImageShrinker, type ImageSource } from '../../src/pdf/shrinkImages';
import { sampleIdJpeg, samplePng, withExifOrientation } from '../../scripts/lib/sampleDocs';
import { withJpegSize } from '../support/jpeg';

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

/** Stand-in for the browser's re-encoder: reports the scaled size and returns tiny JPEG bytes. */
const fakeShrinker: ImageShrinker = async (source, maxEdge) => {
  const [w, h] = source.kind === 'pixels' ? [source.width, source.height] : [1000, 630];
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { bytes: sampleIdJpeg().slice(0, 100), width: Math.round(w * scale), height: Math.round(h * scale) };
};

/** Pseudo-random pixels, which compress about as badly as a photo or scan. */
function noise(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let state = 0x9e3779b9;
  for (let i = 0; i < length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[i] = state & 0xff;
  }
  return bytes;
}

/** Adds a losslessly stored (Flate) image to a document, as Pages and Word export them. */
function addLosslessImage(
  doc: PDFDocument,
  width: number,
  height: number,
  options: { channels?: 1 | 3; data?: Uint8Array; extra?: Record<string, unknown> } = {},
): PDFRef {
  const channels = options.channels ?? 3;
  const data = options.data ?? noise(width * height * channels);
  const profile = doc.context.register(doc.context.flateStream(new Uint8Array(10), { N: channels }));
  return doc.context.register(
    PDFRawStream.of(
      doc.context.obj({
        Type: 'XObject',
        Subtype: 'Image',
        Width: width,
        Height: height,
        BitsPerComponent: 8,
        ColorSpace: ['ICCBased', profile],
        Filter: 'FlateDecode',
        ...options.extra,
      }),
      deflateSync(data),
    ),
  );
}

/** Encodes rows with PNG filters (type per row, cycling through Sub, Up, Average, Paeth, None). */
function withPngPredictor(pixels: Uint8Array, rowLength: number, bytesPerPixel: number): Uint8Array {
  const rows = pixels.byteLength / rowLength;
  const out = new Uint8Array((rowLength + 1) * rows);
  for (let row = 0; row < rows; row++) {
    const type = [1, 2, 3, 4, 0][row % 5] as number;
    out[row * (rowLength + 1)] = type;
    for (let i = 0; i < rowLength; i++) {
      const at = (r: number, c: number) => (r < 0 || c < 0 ? 0 : (pixels[r * rowLength + c] as number));
      const left = at(row, i - bytesPerPixel);
      const up = at(row - 1, i);
      const upLeft = at(row - 1, i - bytesPerPixel);
      const estimate = left + up - upLeft;
      const paeth =
        Math.abs(estimate - left) <= Math.abs(estimate - up) && Math.abs(estimate - left) <= Math.abs(estimate - upLeft)
          ? left
          : Math.abs(estimate - up) <= Math.abs(estimate - upLeft)
            ? up
            : upLeft;
      const predicted = [0, left, up, (left + up) >> 1, paeth][type] as number;
      out[row * (rowLength + 1) + 1 + i] = ((pixels[row * rowLength + i] as number) - predicted) & 0xff;
    }
  }
  return out;
}

/** Runs the shrinker and records what it was asked to re-encode. */
async function shrinkRecording(doc: PDFDocument, maxEdge: number, shrinker: ImageShrinker = fakeShrinker) {
  const sources: ImageSource[] = [];
  const saved = await shrinkPdfImages(doc, {
    maxEdge,
    quality: 0.8,
    shrink: (source, edge, quality) => {
      sources.push(source);
      return shrinker(source, edge, quality);
    },
  });
  return { saved, sources };
}

const streamAt = (doc: PDFDocument, ref: PDFRef) => doc.context.lookup(ref) as PDFRawStream;

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

  it('keeps the original if re-encoding fails or gives anything but a smaller JPEG', async () => {
    const doc = await PDFDocument.load(await pdfWithJpeg(sampleIdJpeg()));
    const bigger: ImageShrinker = async (source) => ({
      bytes: new Uint8Array(source.bytes.byteLength + 1),
      width: 500,
      height: 315,
    });
    expect(await shrinkPdfImages(doc, { maxEdge: 500, quality: 0.8, shrink: bigger })).toBe(0);
    const notJpeg: ImageShrinker = async () => ({ bytes: samplePng(10, 10, [0, 0, 0]), width: 500, height: 315 });
    expect(await shrinkPdfImages(doc, { maxEdge: 500, quality: 0.8, shrink: notJpeg })).toBe(0);
    const failing: ImageShrinker = async () => {
      throw new Error('decode failed');
    };
    expect(await shrinkPdfImages(doc, { maxEdge: 500, quality: 0.8, shrink: failing })).toBe(0);
    expect(width(imageStreams(doc)[0]!)).toBe(1000);
  });

  it('shrinks JPEGs with a rotation tag as stored, since PDF viewers ignore the tag', async () => {
    const doc = await PDFDocument.load(await pdfWithJpeg(withExifOrientation(sampleIdJpeg(), 6)));
    const { saved, sources } = await shrinkRecording(doc, 500);
    expect(saved).toBeGreaterThan(0);
    expect(sources).toHaveLength(1);
    const sent = sources[0] as Extract<ImageSource, { kind: 'jpeg' }>;
    expect(sent.kind).toBe('jpeg');
    expect(readJpegOrientation(sent.bytes)).toBe(1); // decoded as stored, not turned
    expect(width(imageStreams(doc)[0]!)).toBe(500);
  });

  it('re-encodes oversized losslessly stored images from their pixels', async () => {
    const doc = await PDFDocument.create();
    const pixels = noise(800 * 600 * 3);
    const ref = addLosslessImage(doc, 800, 600, { data: pixels });
    const { saved, sources } = await shrinkRecording(doc, 400);

    const [sent] = sources as [Extract<ImageSource, { kind: 'pixels' }>];
    expect({ ...sent, bytes: null }).toEqual({ kind: 'pixels', bytes: null, width: 800, height: 600, channels: 3 });
    expect(Buffer.from(sent.bytes).equals(pixels)).toBe(true);
    const after = streamAt(doc, ref);
    expect(after.dict.get(PDFName.of('Filter'))).toBe(PDFName.of('DCTDecode'));
    expect(after.dict.get(PDFName.of('ColorSpace'))).toBe(PDFName.of('DeviceRGB'));
    expect(width(after)).toBe(400);
    expect(saved).toBeGreaterThan(1_000_000);
  });

  it('undoes PNG predictors and reads grayscale', async () => {
    const doc = await PDFDocument.create();
    const pixels = noise(300 * 200);
    addLosslessImage(doc, 300, 200, {
      channels: 1,
      data: withPngPredictor(pixels, 300, 1),
      extra: { DecodeParms: { Predictor: 15, Colors: 1, Columns: 300 } },
    });
    const { sources } = await shrinkRecording(doc, 100);
    expect(sources).toEqual([{ kind: 'pixels', bytes: pixels, width: 300, height: 200, channels: 1 }]);
  });

  it('swaps a large lossless image within the limit only for a JPEG under half its size', async () => {
    const make = async () => {
      const doc = await PDFDocument.create();
      return { doc, ref: addLosslessImage(doc, 400, 300) }; // about 360 KB, under the 500 px limit
    };
    const sized =
      (fraction: number): ImageShrinker =>
      async (source) => {
        const bytes = new Uint8Array(Math.round(400 * 300 * 3 * fraction));
        bytes.set(sampleIdJpeg().subarray(0, 3));
        return { bytes, width: (source as { width: number }).width, height: 300 };
      };

    const kept = await make();
    expect((await shrinkRecording(kept.doc, 500, sized(0.6))).saved).toBe(0);
    expect(streamAt(kept.doc, kept.ref).dict.get(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'));

    const swapped = await make();
    expect((await shrinkRecording(swapped.doc, 500, sized(0.3))).saved).toBeGreaterThan(0);
    expect(width(streamAt(swapped.doc, swapped.ref))).toBe(400); // re-encoded at the same size
  });

  it('leaves small lossless images, like logos, alone', async () => {
    const doc = await PDFDocument.create();
    addLosslessImage(doc, 100, 100);
    const { sources } = await shrinkRecording(doc, 500);
    expect(sources).toHaveLength(0);
  });

  it('reads JPEGs that are additionally Flate-compressed', async () => {
    const doc = await PDFDocument.create();
    const jpeg = sampleIdJpeg();
    doc.context.register(
      PDFRawStream.of(
        doc.context.obj({
          Subtype: 'Image',
          Width: 1000,
          Height: 630,
          BitsPerComponent: 8,
          ColorSpace: 'DeviceRGB',
          Filter: ['FlateDecode', 'DCTDecode'],
        }),
        deflateSync(jpeg),
      ),
    );
    const { sources } = await shrinkRecording(doc, 500);
    expect(sources).toEqual([{ kind: 'jpeg', bytes: jpeg }]);
  });

  it('keeps images it can’t re-encode faithfully', async () => {
    const doc = await PDFDocument.create();
    const unsupported = [
      { extra: { ColorSpace: 'DeviceCMYK' }, data: noise(800 * 600 * 4) },
      { extra: { BitsPerComponent: 16 } },
      { extra: { Mask: [0, 10, 0, 10, 0, 10] } }, // color-key mask needs exact colors
      { extra: { Decode: [1, 0, 1, 0, 1, 0] } },
      { extra: { DecodeParms: { Predictor: 2, Colors: 3, Columns: 800 } } }, // TIFF predictor
      { extra: { Filter: 'JPXDecode' } },
    ];
    for (const options of unsupported) addLosslessImage(doc, 800, 600, options);
    const { saved, sources } = await shrinkRecording(doc, 400);
    expect(sources).toHaveLength(0);
    expect(saved).toBe(0);
  });

  it('keeps an image whose data is shorter than its stated size', async () => {
    const doc = await PDFDocument.create();
    addLosslessImage(doc, 800, 600, { data: noise(800 * 300 * 3) });
    expect((await shrinkRecording(doc, 400)).sources).toHaveLength(0);
  });

  it('keeps an image whose data unpacks to more than its stated size', async () => {
    const doc = await PDFDocument.create();
    const ref = addLosslessImage(doc, 800, 600, { data: new Uint8Array(800 * 600 * 3 * 4) });
    expect((await shrinkRecording(doc, 400)).sources).toHaveLength(0);
    expect(streamAt(doc, ref).dict.get(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'));
  });

  it('keeps a Flate-compressed JPEG that unpacks to more than its raw pixels would take', async () => {
    const doc = await PDFDocument.create();
    const padded = new Uint8Array(1000 * 630 * 3 + 1);
    padded.set(sampleIdJpeg());
    doc.context.register(
      PDFRawStream.of(
        doc.context.obj({
          Subtype: 'Image',
          Width: 1000,
          Height: 630,
          BitsPerComponent: 8,
          ColorSpace: 'DeviceRGB',
          Filter: ['FlateDecode', 'DCTDecode'],
        }),
        deflateSync(padded),
      ),
    );
    expect((await shrinkRecording(doc, 500)).sources).toHaveLength(0);
  });

  it('keeps a JPEG whose real size differs from what its dictionary says', async () => {
    for (const jpeg of [withJpegSize(sampleIdJpeg(), 1000, 631), withJpegSize(sampleIdJpeg(), 60_000, 60_000)]) {
      const doc = await PDFDocument.load(await pdfWithJpeg(sampleIdJpeg()));
      const stream = imageStreams(doc)[0]!;
      const ref = doc.context.getObjectRef(stream)!;
      doc.context.assign(ref, PDFRawStream.of(stream.dict, jpeg));
      expect((await shrinkRecording(doc, 500)).sources).toHaveLength(0);
    }
  });

  it('keeps soft masks, which hold another image’s transparency, as they are', async () => {
    const doc = await PDFDocument.create();
    const mask = addLosslessImage(doc, 800, 600, { channels: 1, extra: { ColorSpace: 'DeviceGray' } });
    const photo = addLosslessImage(doc, 800, 600, { extra: { SMask: mask } });
    const { sources } = await shrinkRecording(doc, 400);

    expect(sources).toHaveLength(1);
    expect((sources[0] as Extract<ImageSource, { kind: 'pixels' }>).channels).toBe(3);
    expect(width(streamAt(doc, photo))).toBe(400);
    expect(streamAt(doc, photo).dict.get(PDFName.of('SMask'))).toBe(mask);
    const kept = streamAt(doc, mask);
    expect(width(kept)).toBe(800);
    expect(kept.dict.get(PDFName.of('ColorSpace'))).toBe(PDFName.of('DeviceGray'));
    expect(kept.dict.get(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'));
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
