/** Copies a JPEG with the size in its frame header changed, leaving the image data as it was. */
export function withJpegSize(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  const copy = jpeg.slice();
  const view = new DataView(copy.buffer);
  let offset = 2;
  while (offset + 4 <= copy.length) {
    const marker = copy[offset + 1] ?? 0;
    if (marker === 0xc0 || marker === 0xc2) {
      view.setUint16(offset + 5, height);
      view.setUint16(offset + 7, width);
      return copy;
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  throw new Error('no frame header found');
}

/** Joins JPEG segments (each starting with its 0xFF marker) after the start-of-image marker. */
export function jpegFromSegments(...segments: readonly Uint8Array[]): Uint8Array {
  const parts = [new Uint8Array([0xff, 0xd8]), ...segments];
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let position = 0;
  for (const part of parts) {
    result.set(part, position);
    position += part.byteLength;
  }
  return result;
}

/** An APPn segment holding `text` (for example "Exif\0\0" or an XMP header) and some filler. */
export function appSegment(marker: number, text: string, fillerLength = 8): Uint8Array {
  const payload = new Uint8Array([...new TextEncoder().encode(text), ...new Uint8Array(fillerLength).fill(0x2a)]);
  const length = payload.byteLength + 2;
  return new Uint8Array([0xff, marker, length >> 8, length & 0xff, ...payload]);
}
