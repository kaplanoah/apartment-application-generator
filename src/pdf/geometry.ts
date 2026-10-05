/** Page geometry helpers, kept free of pdf-lib so they're easy to test. */

export type QuarterTurn = 0 | 90 | 180 | 270;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Placement {
  readonly x: number;
  readonly y: number;
  /** Counter-clockwise rotation in degrees, as pdf-lib expects. */
  readonly rotate: number;
}

/** US Letter in PDF points (1/72"). */
export const LETTER = { width: 612, height: 792 } as const;

export function normalizeQuarterTurn(degrees: number): QuarterTurn {
  const turn = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  return turn as QuarterTurn;
}

/** Size of the page as the reader sees it, after the page's /Rotate. */
export function measureVisibleSize(box: Box, rotation: QuarterTurn): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: box.height, height: box.width }
    : { width: box.width, height: box.height };
}

/**
 * Converts a point measured from the visible bottom-left corner of a page
 * into the page's own coordinates, plus the text rotation needed to read
 * upright. PDF viewers rotate pages clockwise by /Rotate.
 */
export function mapVisiblePointToPage(box: Box, rotation: QuarterTurn, visibleX: number, visibleY: number): Placement {
  switch (rotation) {
    case 0:
      return { x: box.x + visibleX, y: box.y + visibleY, rotate: 0 };
    case 90:
      return { x: box.x + box.width - visibleY, y: box.y + visibleX, rotate: 90 };
    case 180:
      return { x: box.x + box.width - visibleX, y: box.y + box.height - visibleY, rotate: 180 };
    case 270:
      return { x: box.x + visibleY, y: box.y + box.height - visibleX, rotate: 270 };
  }
}

export interface ImagePlacement extends Placement {
  /** Drawn size in the image's own (unrotated) orientation. */
  readonly width: number;
  readonly height: number;
}

/**
 * Fits an image inside `area`, centered and scaled to fit, after turning it
 * clockwise by `turn` (how a photo's EXIF orientation says it should be
 * shown). Returns what pdf-lib's drawImage needs.
 */
export function fitImage(imageWidth: number, imageHeight: number, turn: QuarterTurn, area: Box): ImagePlacement {
  const sideways = turn === 90 || turn === 270;
  const shownWidth = sideways ? imageHeight : imageWidth;
  const shownHeight = sideways ? imageWidth : imageHeight;
  const scale = Math.min(area.width / shownWidth, area.height / shownHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const left = area.x + (area.width - shownWidth * scale) / 2;
  const bottom = area.y + (area.height - shownHeight * scale) / 2;

  // pdf-lib rotates around the image's bottom-left corner, counter-clockwise.
  switch (turn) {
    case 0:
      return { x: left, y: bottom, rotate: 0, width, height };
    case 90:
      return { x: left, y: bottom + width, rotate: -90, width, height };
    case 180:
      return { x: left + width, y: bottom + height, rotate: 180, width, height };
    case 270:
      return { x: left + height, y: bottom, rotate: 90, width, height };
  }
}

/** Letter page in the orientation that suits the image best. */
export function choosePageSizeForImage(
  imageWidth: number,
  imageHeight: number,
  turn: QuarterTurn,
): { width: number; height: number } {
  const sideways = turn === 90 || turn === 270;
  const landscape = sideways ? imageHeight > imageWidth : imageWidth > imageHeight;
  return landscape ? { width: LETTER.height, height: LETTER.width } : { ...LETTER };
}
