import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, type PDFDocument, type PDFObject } from 'pdf-lib';
import { readJpegOrientation } from './exif';
import { sniffImageFormat } from './images';

export interface ShrunkImage {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Re-encodes a JPEG so its longest edge is at most `maxEdge`, or returns null if it can't. */
export type JpegShrinker = (jpeg: Uint8Array, maxEdge: number, quality: number) => Promise<ShrunkImage | null>;

export interface ImageLimits {
  /** Longest image edge to keep, in pixels. */
  readonly maxEdge: number;
  /** JPEG quality, 0–1, for images that get re-encoded. */
  readonly quality: number;
  readonly shrink: JpegShrinker;
}

const NAME = {
  Subtype: PDFName.of('Subtype'),
  Image: PDFName.of('Image'),
  Filter: PDFName.of('Filter'),
  DCTDecode: PDFName.of('DCTDecode'),
  DecodeParms: PDFName.of('DecodeParms'),
  ImageMask: PDFName.of('ImageMask'),
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
 * Only plain 8-bit color or grayscale JPEG images are touched; anything
 * unusual (CMYK, masks, custom decoding, rotated JPEGs) is kept as-is, and a
 * re-encoded image replaces the original only if it's actually smaller.
 * Returns the number of bytes saved.
 */
export async function shrinkPdfImages(pdf: PDFDocument, limits: ImageLimits): Promise<number> {
  let saved = 0;
  for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || !isPlainJpegImage(pdf, object.dict)) continue;
    const width = numberValue(pdf, object.dict.get(NAME.Width));
    const height = numberValue(pdf, object.dict.get(NAME.Height));
    if (!width || !height || Math.max(width, height) <= limits.maxEdge) continue;
    if (readJpegOrientation(object.contents) !== 1) continue;

    const shrunk = await limits.shrink(object.contents, limits.maxEdge, limits.quality).catch(() => null);
    if (!isUsableReplacement(shrunk, object.contents.byteLength)) continue;

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

/** Only a real JPEG that's actually smaller may replace the original. */
function isUsableReplacement(shrunk: ShrunkImage | null, originalLength: number): shrunk is ShrunkImage {
  return (
    shrunk !== null &&
    shrunk.bytes.byteLength < originalLength &&
    sniffImageFormat(shrunk.bytes) === 'jpg' &&
    shrunk.width > 0 &&
    shrunk.height > 0
  );
}

function isPlainJpegImage(pdf: PDFDocument, dict: PDFDict): boolean {
  if (lookup(pdf, dict.get(NAME.Subtype)) !== NAME.Image) return false;
  if (lookup(pdf, dict.get(NAME.ImageMask)) !== undefined) return false;
  if (dict.has(NAME.Decode) || (dict.has(NAME.DecodeParms) && !isOnlyNull(pdf, dict.get(NAME.DecodeParms))))
    return false;

  const filter = lookup(pdf, dict.get(NAME.Filter));
  const isJpeg =
    filter === NAME.DCTDecode ||
    (filter instanceof PDFArray && filter.size() === 1 && lookup(pdf, filter.get(0)) === NAME.DCTDecode);
  if (!isJpeg) return false;

  const bits = numberValue(pdf, dict.get(NAME.BitsPerComponent));
  if (bits !== undefined && bits !== 8) return false;
  return isRgbOrGray(pdf, lookup(pdf, dict.get(NAME.ColorSpace)));
}

function isRgbOrGray(pdf: PDFDocument, space: PDFObject | undefined): boolean {
  if (space === NAME.DeviceRGB || space === NAME.DeviceGray) return true;
  if (space instanceof PDFArray && space.size() === 2 && lookup(pdf, space.get(0)) === NAME.ICCBased) {
    const profile = lookup(pdf, space.get(1));
    const dict = profile instanceof PDFRawStream ? profile.dict : undefined;
    const channels = dict ? numberValue(pdf, dict.get(NAME.N)) : undefined;
    return channels === 1 || channels === 3;
  }
  return false;
}

const lookup = (pdf: PDFDocument, value: PDFObject | undefined): PDFObject | undefined =>
  value === undefined ? undefined : pdf.context.lookup(value);

function numberValue(pdf: PDFDocument, value: PDFObject | undefined): number | undefined {
  const resolved = lookup(pdf, value);
  return resolved instanceof PDFNumber ? resolved.asNumber() : undefined;
}

function isOnlyNull(pdf: PDFDocument, value: PDFObject | undefined): boolean {
  const resolved = lookup(pdf, value);
  return resolved === undefined || resolved.toString() === 'null';
}
