import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  type PDFDocument,
  type PDFObject,
} from 'pdf-lib';
import { readJpegOrientation, withoutExif } from './exif';
import { sniffImageFormat } from './images';

export interface ShrunkImage {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** An image taken out of a PDF to be re-encoded: JPEG bytes, or plain 8-bit pixels. */
export type ImageSource =
  | { readonly kind: 'jpeg'; readonly bytes: Uint8Array }
  | {
      readonly kind: 'pixels';
      /** Rows of gray or RGB samples, one byte each, top to bottom. */
      readonly bytes: Uint8Array;
      readonly width: number;
      readonly height: number;
      readonly channels: 1 | 3;
    };

/**
 * Re-encodes an image as a JPEG whose longest edge is at most `maxEdge`, or returns null if it
 * can't. JPEGs already within the limit are left alone; pixels are always re-encoded.
 */
export type ImageShrinker = (source: ImageSource, maxEdge: number, quality: number) => Promise<ShrunkImage | null>;

export interface ImageLimits {
  /** Longest image edge to keep, in pixels. */
  readonly maxEdge: number;
  /** JPEG quality, 0–1, for images that get re-encoded. */
  readonly quality: number;
  readonly shrink: ImageShrinker;
}

/** Larger images are kept as they are rather than unpacked into memory. */
export const MAX_SHRINK_PIXELS = 50_000_000;
/** Losslessly stored images smaller than this aren't worth re-encoding unless oversized. */
const MIN_LOSSLESS_BYTES = 100 * 1024;
/**
 * A losslessly stored image within the size limit is replaced only by a JPEG at most this
 * fraction of its size: photos and scans easily are, while crisp graphics usually aren't.
 */
const LOSSLESS_TO_JPEG_RATIO = 0.5;

const NAME = {
  Subtype: PDFName.of('Subtype'),
  Image: PDFName.of('Image'),
  Filter: PDFName.of('Filter'),
  DCTDecode: PDFName.of('DCTDecode'),
  FlateDecode: PDFName.of('FlateDecode'),
  DecodeParms: PDFName.of('DecodeParms'),
  Predictor: PDFName.of('Predictor'),
  Colors: PDFName.of('Colors'),
  Columns: PDFName.of('Columns'),
  ImageMask: PDFName.of('ImageMask'),
  Mask: PDFName.of('Mask'),
  Decode: PDFName.of('Decode'),
  BitsPerComponent: PDFName.of('BitsPerComponent'),
  ColorSpace: PDFName.of('ColorSpace'),
  DeviceRGB: PDFName.of('DeviceRGB'),
  DeviceGray: PDFName.of('DeviceGray'),
  ICCBased: PDFName.of('ICCBased'),
  N: PDFName.of('N'),
  Width: PDFName.of('Width'),
  Height: PDFName.of('Height'),
  Length: PDFName.of('Length'),
} as const;

/**
 * Shrinks oversized photos and scans embedded in a PDF, the way Preview's
 * "Reduce File Size" does, but only down to the chosen size limit. Text,
 * drawings and everything else in the PDF are left exactly as they are.
 *
 * Handles 8-bit color and grayscale images stored as JPEG or losslessly (as
 * Pages, Word and "Save as PDF" do). Anything unusual (CMYK, color-key masks,
 * custom decoding, JPEG 2000) is kept as-is, and a re-encoded image replaces
 * the original only if it's a JPEG and smaller. Returns the number of bytes saved.
 */
export async function shrinkPdfImages(pdf: PDFDocument, limits: ImageLimits): Promise<number> {
  let saved = 0;
  for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const image = describeImage(pdf, object.dict);
    if (!image) continue;
    const oversized = Math.max(image.width, image.height) > limits.maxEdge;
    if (image.encoding !== 'lossless' && !oversized) continue;
    if (image.encoding === 'lossless' && !oversized && object.contents.byteLength < MIN_LOSSLESS_BYTES) continue;

    const source = readImageSource(pdf, object, image);
    if (!source) continue;
    const shrunk = await limits.shrink(source, limits.maxEdge, limits.quality).catch(() => null);
    const sizeLimit =
      image.encoding === 'lossless' && !oversized
        ? object.contents.byteLength * LOSSLESS_TO_JPEG_RATIO
        : object.contents.byteLength;
    if (!isUsableReplacement(shrunk, sizeLimit)) continue;

    const dict = object.dict.clone(pdf.context);
    dict.set(NAME.Width, PDFNumber.of(shrunk.width));
    dict.set(NAME.Height, PDFNumber.of(shrunk.height));
    dict.set(NAME.ColorSpace, NAME.DeviceRGB);
    dict.set(NAME.BitsPerComponent, PDFNumber.of(8));
    dict.set(NAME.Filter, NAME.DCTDecode);
    dict.set(NAME.Length, PDFNumber.of(shrunk.bytes.byteLength));
    dict.delete(NAME.DecodeParms);
    pdf.context.assign(ref, PDFRawStream.of(dict, shrunk.bytes));
    saved += object.contents.byteLength - shrunk.bytes.byteLength;
  }
  return saved;
}

interface ImageInfo {
  readonly width: number;
  readonly height: number;
  readonly channels: 1 | 3;
  /** 'lossless' is Flate, possibly with a PNG predictor. */
  readonly encoding: 'jpeg' | 'compressed-jpeg' | 'lossless';
  readonly predictor: number;
}

/** Only a real JPEG under the size limit may replace the original. */
function isUsableReplacement(shrunk: ShrunkImage | null, sizeLimit: number): shrunk is ShrunkImage {
  return (
    shrunk !== null &&
    shrunk.bytes.byteLength < sizeLimit &&
    sniffImageFormat(shrunk.bytes) === 'jpg' &&
    shrunk.width > 0 &&
    shrunk.height > 0
  );
}

/** Describes an image this code knows how to re-encode faithfully, or returns null. */
function describeImage(pdf: PDFDocument, dict: PDFDict): ImageInfo | null {
  if (lookup(pdf, dict.get(NAME.Subtype)) !== NAME.Image) return null;
  // Stencil and color-key masks depend on exact pixel values, which JPEG doesn't keep.
  if (lookup(pdf, dict.get(NAME.ImageMask)) !== undefined || dict.has(NAME.Mask)) return null;
  if (dict.has(NAME.Decode)) return null;
  const bits = numberValue(pdf, dict.get(NAME.BitsPerComponent));
  if (bits !== undefined && bits !== 8) return null;
  const channels = channelCount(pdf, lookup(pdf, dict.get(NAME.ColorSpace)));
  const width = numberValue(pdf, dict.get(NAME.Width));
  const height = numberValue(pdf, dict.get(NAME.Height));
  if (!channels || !width || !height || !Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width * height > MAX_SHRINK_PIXELS) return null;

  const filters = asList(pdf, dict.get(NAME.Filter));
  const parms = asList(pdf, dict.get(NAME.DecodeParms));
  const parmsAt = (i: number) => {
    const value = parms[i];
    return value instanceof PDFDict ? value : value === undefined || value.toString() === 'null' ? null : undefined;
  };
  if (filters.length === 1 && filters[0] === NAME.DCTDecode && parmsAt(0) === null) {
    return { width, height, channels, encoding: 'jpeg', predictor: 1 };
  }
  if (filters.length === 2 && filters[0] === NAME.FlateDecode && filters[1] === NAME.DCTDecode) {
    return parmsAt(0) === null && parmsAt(1) === null
      ? { width, height, channels, encoding: 'compressed-jpeg', predictor: 1 }
      : null;
  }
  if (filters.length === 1 && filters[0] === NAME.FlateDecode) {
    const predictor = flatePredictor(pdf, parmsAt(0), width, channels);
    return predictor === null ? null : { width, height, channels, encoding: 'lossless', predictor };
  }
  return null;
}

/** The PNG predictor in use (1 for none), or null when the parameters aren't the plain kind. */
function flatePredictor(pdf: PDFDocument, parms: PDFDict | null | undefined, width: number, channels: number) {
  if (parms === null) return 1;
  if (parms === undefined) return null;
  const predictor = numberValue(pdf, parms.get(NAME.Predictor)) ?? 1;
  if (predictor === 1) return 1;
  if (predictor < 10 || predictor > 15) return null; // TIFF predictors aren't handled
  const colors = numberValue(pdf, parms.get(NAME.Colors)) ?? 1;
  const bits = numberValue(pdf, parms.get(NAME.BitsPerComponent)) ?? 8;
  const columns = numberValue(pdf, parms.get(NAME.Columns)) ?? 1;
  return colors === channels && bits === 8 && columns === width ? predictor : null;
}

/** Unpacks the image's data for re-encoding, or returns null if it isn't what it claims. */
function readImageSource(pdf: PDFDocument, stream: PDFRawStream, image: ImageInfo): ImageSource | null {
  try {
    if (image.encoding !== 'lossless') {
      const jpeg = image.encoding === 'compressed-jpeg' ? inflate(pdf, stream.contents) : stream.contents;
      if (sniffImageFormat(jpeg) !== 'jpg') return null;
      // PDF viewers ignore a JPEG's rotation tag and browsers apply it: decode it as viewers do.
      return { kind: 'jpeg', bytes: readJpegOrientation(jpeg) === 1 ? jpeg : withoutExif(jpeg) };
    }
    const rowLength = image.width * image.channels;
    const data = inflate(pdf, stream.contents);
    const pixels = image.predictor === 1 ? data : undoPngPredictor(data, rowLength, image.channels, image.height);
    if (!pixels || pixels.byteLength < rowLength * image.height) return null;
    return {
      kind: 'pixels',
      bytes: pixels.subarray(0, rowLength * image.height),
      width: image.width,
      height: image.height,
      channels: image.channels,
    };
  } catch {
    return null;
  }
}

function inflate(pdf: PDFDocument, contents: Uint8Array): Uint8Array {
  const dict = pdf.context.obj({ Filter: NAME.FlateDecode });
  return decodePDFRawStream(PDFRawStream.of(dict, contents)).decode();
}

/**
 * Reverses PNG row filters (PDF predictors 10–15): each row starts with a filter type byte
 * and stores differences from neighboring bytes. Returns null on anything unexpected.
 */
function undoPngPredictor(data: Uint8Array, rowLength: number, bytesPerPixel: number, rows: number): Uint8Array | null {
  if (data.byteLength < (rowLength + 1) * rows) return null;
  const out = new Uint8Array(rowLength * rows);
  for (let row = 0; row < rows; row++) {
    const type = data[row * (rowLength + 1)];
    const input = row * (rowLength + 1) + 1;
    const start = row * rowLength;
    for (let i = 0; i < rowLength; i++) {
      const raw = data[input + i] as number;
      const left = i >= bytesPerPixel ? (out[start + i - bytesPerPixel] as number) : 0;
      const up = row > 0 ? (out[start - rowLength + i] as number) : 0;
      const upLeft = row > 0 && i >= bytesPerPixel ? (out[start - rowLength + i - bytesPerPixel] as number) : 0;
      let predicted: number;
      switch (type) {
        case 0:
          predicted = 0;
          break;
        case 1:
          predicted = left;
          break;
        case 2:
          predicted = up;
          break;
        case 3:
          predicted = (left + up) >> 1;
          break;
        case 4:
          predicted = paeth(left, up, upLeft);
          break;
        default:
          return null;
      }
      out[start + i] = (raw + predicted) & 0xff;
    }
  }
  return out;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

function channelCount(pdf: PDFDocument, space: PDFObject | undefined): 1 | 3 | null {
  if (space === NAME.DeviceGray) return 1;
  if (space === NAME.DeviceRGB) return 3;
  if (space instanceof PDFArray && space.size() === 2 && lookup(pdf, space.get(0)) === NAME.ICCBased) {
    const profile = lookup(pdf, space.get(1));
    const channels = profile instanceof PDFRawStream ? numberValue(pdf, profile.dict.get(NAME.N)) : undefined;
    return channels === 1 || channels === 3 ? channels : null;
  }
  return null;
}

/** A filter or parameter entry as a list: a single value, an array's items, or nothing. */
function asList(pdf: PDFDocument, value: PDFObject | undefined): PDFObject[] {
  const resolved = lookup(pdf, value);
  if (resolved === undefined) return [];
  if (resolved instanceof PDFArray) return resolved.asArray().map((item) => lookup(pdf, item) ?? item);
  return [resolved];
}

const lookup = (pdf: PDFDocument, value: PDFObject | undefined): PDFObject | undefined =>
  value === undefined ? undefined : pdf.context.lookup(value);

function numberValue(pdf: PDFDocument, value: PDFObject | undefined): number | undefined {
  const resolved = lookup(pdf, value);
  return resolved instanceof PDFNumber ? resolved.asNumber() : undefined;
}
