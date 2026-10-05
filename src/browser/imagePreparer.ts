import { UserFacingError } from '../core/errors';
import { extensionOf } from '../core/fileTypes';
import type { SizePreset } from '../core/sizePresets';
import { tryUseAsIs, type ImagePreparer } from '../pdf/images';
import type { ImageShrinker, ImageSource } from '../pdf/shrinkImages';

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
};

/** A PNG is swapped for a JPEG only when that's at most this fraction of its size. */
const PNG_TO_JPEG_RATIO = 0.5;

/** The largest canvas iPhone and iPad Safari will draw on; a bigger one silently fails. */
export const MAX_CANVAS_PIXELS = 16_777_216;

const CANT_RESIZE = 'this photo couldn’t be resized. Open it in Preview, export it as JPEG, then add the folder again.';

type PixelSource = Extract<ImageSource, { kind: 'pixels' }>;

/**
 * Prepares photos for the PDF using the browser's own decoder, entirely in
 * memory. Photos already small enough are kept byte-for-byte; larger ones are
 * scaled down to the preset's limit. PNGs that are really photos or scans
 * become JPEGs. HEIC (iPhone) photos work in Safari.
 */
export function createImagePreparer(preset: SizePreset): ImagePreparer {
  return async (bytes, fileName) => {
    const asIs = tryUseAsIs(bytes);

    const image = await decode(bytes, fileName);
    try {
      const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = Math.min(1, preset.maxImageEdge / longEdge);
      const draw = (format: 'jpg' | 'png') =>
        redraw(image.element, image.naturalWidth, image.naturalHeight, scale, format, preset.jpegQuality, fileName);

      if (asIs?.format === 'png') {
        const png = scale < 1 ? await draw('png') : asIs;
        const jpeg = await draw('jpg');
        const chosen = jpeg.bytes.byteLength <= png.bytes.byteLength * PNG_TO_JPEG_RATIO ? jpeg : png;
        return { bytes: chosen.bytes, format: chosen.format, turn: 0 };
      }
      if (asIs && scale === 1) return asIs;
      const redrawn = await draw('jpg');
      return { bytes: redrawn.bytes, format: redrawn.format, turn: 0 };
    } finally {
      image.release();
    }
  };
}

/**
 * Re-encodes an image found inside a PDF as a smaller JPEG, for the sealed worker. Returns null
 * to keep the original: when it can't be decoded, or a JPEG is already within the limit.
 */
export const shrinkPdfImage: ImageShrinker = async (source, maxEdge, quality) => {
  if (source.kind === 'pixels') {
    const canvas = pixelsToCanvas(source);
    try {
      const { width, height } = canvas;
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      return await redraw(canvas, width, height, scale, 'jpg', quality, 'image');
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
  const image = await decode(source.bytes, 'image.jpg').catch(() => null);
  if (!image) return null;
  try {
    const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
    if (longEdge <= maxEdge) return null;
    return await redraw(
      image.element,
      image.naturalWidth,
      image.naturalHeight,
      maxEdge / longEdge,
      'jpg',
      quality,
      'image',
    );
  } finally {
    image.release();
  }
};

/** Draws gray or RGB samples onto a canvas, first shrinking images too big for one. */
function pixelsToCanvas(source: PixelSource): HTMLCanvasElement {
  const { width, height, rgba } = toRgbaPixels(source, canvasShrinkFactor(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

/** The smallest whole-number factor that shrinks an image enough to fit on a canvas. */
export function canvasShrinkFactor(width: number, height: number): number {
  let factor = 1;
  while (Math.ceil(width / factor) * Math.ceil(height / factor) > MAX_CANVAS_PIXELS) factor++;
  return factor;
}

/** Turns gray or RGB samples into RGBA, averaging each block of factor × factor pixels into one. */
export function toRgbaPixels(
  { width, height, channels, bytes }: PixelSource,
  factor: number,
): { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> } {
  const outWidth = Math.ceil(width / factor);
  const outHeight = Math.ceil(height / factor);
  const rgba = new Uint8ClampedArray(outWidth * outHeight * 4);
  // Gray images repeat their one sample for red, green and blue.
  const greenOffset = channels === 3 ? 1 : 0;
  const blueOffset = channels === 3 ? 2 : 0;
  for (let outY = 0; outY < outHeight; outY++) {
    for (let outX = 0; outX < outWidth; outX++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;
      for (let y = outY * factor; y < Math.min(height, (outY + 1) * factor); y++) {
        for (let x = outX * factor; x < Math.min(width, (outX + 1) * factor); x++) {
          const from = (y * width + x) * channels;
          red += bytes[from] as number;
          green += bytes[from + greenOffset] as number;
          blue += bytes[from + blueOffset] as number;
          count++;
        }
      }
      const to = (outY * outWidth + outX) * 4;
      rgba[to] = red / count;
      rgba[to + 1] = green / count;
      rgba[to + 2] = blue / count;
      rgba[to + 3] = 255;
    }
  }
  return { width: outWidth, height: outHeight, rgba };
}

interface DecodedImage {
  readonly element: HTMLImageElement;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly release: () => void;
}

/** Decodes via <img>, which applies EXIF orientation in every current browser. */
async function decode(bytes: Uint8Array, fileName: string): Promise<DecodedImage> {
  const type = MIME_BY_EXTENSION[extensionOf(fileName)] ?? 'application/octet-stream';
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const element = new Image();
  element.src = url;
  try {
    await element.decode();
  } catch {
    URL.revokeObjectURL(url);
    const isHeic = type === 'image/heic' || type === 'image/heif';
    throw new UserFacingError(
      isHeic
        ? `${fileName}: this browser can’t open HEIC photos. Use Safari, or open the photo in Preview and export it as JPEG.`
        : `${fileName}: this photo couldn’t be opened. Try opening it in Preview and exporting it as JPEG.`,
    );
  }
  return {
    element,
    naturalWidth: element.naturalWidth,
    naturalHeight: element.naturalHeight,
    release: () => URL.revokeObjectURL(url),
  };
}

async function redraw(
  source: CanvasImageSource,
  width: number,
  height: number,
  scale: number,
  format: 'jpg' | 'png',
  quality: number,
  fileName: string,
): Promise<{ bytes: Uint8Array; format: 'jpg' | 'png'; width: number; height: number }> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new UserFacingError(`${fileName}: ${CANT_RESIZE}`);
  if (format === 'jpg') {
    context.fillStyle = '#fff'; // JPEG has no transparency
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, format === 'jpg' ? 'image/jpeg' : 'image/png', quality),
  );
  const { width: outWidth, height: outHeight } = canvas;
  canvas.width = canvas.height = 0; // free the pixels right away
  if (!blob) throw new UserFacingError(`${fileName}: ${CANT_RESIZE}`);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), format, width: outWidth, height: outHeight };
}
