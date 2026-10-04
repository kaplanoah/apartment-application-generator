import { UserFacingError } from '../core/errors';
import { orientationToTurn, readJpegOrientation } from './exif';
import type { QuarterTurn } from './geometry';

export type EmbeddableFormat = 'jpg' | 'png';

/** An image ready to embed: JPEG or PNG bytes, plus how to turn it upright. */
export interface PreparedImage {
  readonly bytes: Uint8Array;
  readonly format: EmbeddableFormat;
  readonly turn: QuarterTurn;
}

/**
 * Converts any supported photo into an embeddable image. The browser version
 * decodes HEIC/WebP and resizes; tests use `prepareImageAsIs`.
 */
export type ImagePreparer = (bytes: Uint8Array, fileName: string) => Promise<PreparedImage>;

/** Identifies JPEG and PNG by their content rather than trusting the extension. */
export function sniffImageFormat(bytes: Uint8Array): EmbeddableFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((value, i) => bytes[i] === value)) return 'png';
  return null;
}

/**
 * Uses a JPEG or PNG exactly as it is, honoring a JPEG's EXIF rotation.
 * Returns null when the image needs decoding or redrawing first.
 */
export function tryUseAsIs(bytes: Uint8Array): PreparedImage | null {
  const format = sniffImageFormat(bytes);
  if (format === 'png') return { bytes, format, turn: 0 };
  if (format === 'jpg') {
    const turn = orientationToTurn(readJpegOrientation(bytes));
    return turn === null ? null : { bytes, format, turn };
  }
  return null;
}

/** Preparer with no resizing or decoding; used outside the browser. */
export const prepareImageAsIs: ImagePreparer = async (bytes, fileName) => {
  const prepared = tryUseAsIs(bytes);
  if (!prepared) throw new UserFacingError(`${fileName}: this photo format can't be read here.`);
  return prepared;
};
