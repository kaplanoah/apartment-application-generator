export interface JpegSize {
  readonly width: number;
  readonly height: number;
  /** 1 for grayscale, 3 for color, 4 for CMYK. */
  readonly components: number;
}

/**
 * Reads a JPEG's real pixel size from its frame header, so it can be checked before anything
 * decodes it. Input is untrusted: every read is bounds-checked, and anything unexpected (or a
 * height left for later in the file) gives null.
 */
export function readJpegSize(bytes: Uint8Array): JpegSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) return null; // image data starts before any frame header
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if (isFrameHeader(marker)) {
      if (length < 8) return null;
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      const components = bytes[offset + 9] ?? 0;
      return width > 0 && height > 0 && components > 0 ? { width, height, components } : null;
    }
    offset += 2 + length;
  }
  return null;
}

/** Start-of-frame markers C0–CF, except C4 (Huffman tables), C8 (reserved) and CC (arithmetic coding). */
function isFrameHeader(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}
