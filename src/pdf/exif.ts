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
      const orientation = orientationFromApp1(view, offset + 4, length - 2);
      if (orientation) return orientation;
    }
    offset += 2 + length;
  }
  return 1;
}

function orientationFromApp1(view: DataView, start: number, length: number): number | null {
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
export function orientationToTurn(orientation: number): QuarterTurn | null {
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
