import type { QuarterTurn } from './geometry';

/**
 * Reads the EXIF orientation (1–8) from a JPEG, or 1 when absent. Phones store
 * photos sideways and rely on this tag, so it decides how the photo is drawn.
 * The parser is defensive: input is untrusted, every read is bounds-checked,
 * and anything unexpected falls back to 1.
 */
export function readJpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) return 1; // image data starts: no EXIF
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return 1;
    if (marker === 0xe1) {
      const orientation = readOrientationFromApp1(view, offset + 4, length - 2);
      if (orientation) return orientation;
    }
    offset += 2 + length;
  }
  return 1;
}

function readOrientationFromApp1(view: DataView, start: number, length: number): number | null {
  const end = start + length;
  // "Exif\0\0"
  if (length < 14 || view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return null;
  const tiff = start + 6;
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  if (view.getUint16(tiff + 2, little) !== 42) return null;

  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/**
 * Clockwise turn needed to show the photo upright, or null for mirrored
 * orientations (2, 4, 5, 7), which have to be redrawn instead.
 */
export function convertOrientationToTurn(orientation: number): QuarterTurn | null {
  switch (orientation) {
    case 1:
      return 0;
    case 3:
      return 180;
    case 6:
      return 90;
    case 8:
      return 270;
    default:
      return null;
  }
}

/**
 * Returns the JPEG without its EXIF block, so a decoder draws the pixels as stored, the way PDF
 * viewers do, instead of applying the rotation tag. Returns the input unchanged if it has none
 * or isn't laid out as expected.
 */
export function stripExif(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return bytes;

  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let removed = false;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return bytes;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) break; // image data starts
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return bytes;
    const isExif = marker === 0xe1 && length >= 8 && view.getUint32(offset + 4) === 0x45786966;
    if (isExif) removed = true;
    else kept.push(bytes.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  if (!removed) return bytes;
  kept.push(bytes.subarray(offset));

  const result = new Uint8Array(kept.reduce((sum, part) => sum + part.byteLength, 0));
  let position = 0;
  for (const part of kept) {
    result.set(part, position);
    position += part.byteLength;
  }
  return result;
}
