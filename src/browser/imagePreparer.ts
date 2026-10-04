import { UserFacingError } from '../core/errors';
import { extensionOf } from '../core/fileTypes';
import type { SizePreset } from '../core/sizePresets';
import { tryUseAsIs, type ImagePreparer, type PreparedImage } from '../pdf/images';

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
};

/**
 * Prepares photos for the PDF using the browser's own decoder, entirely in
 * memory. Photos already small enough are kept byte-for-byte; larger ones are
 * scaled down to the preset's limit. HEIC (iPhone) photos work in Safari.
 */
export function createImagePreparer(preset: SizePreset): ImagePreparer {
  return async (bytes, fileName) => {
    const asIs = tryUseAsIs(bytes);
    if (asIs && preset.maxImageEdge === null) return asIs;

    const image = await decode(bytes, fileName);
    try {
      const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
      const limit = preset.maxImageEdge ?? longEdge;
      if (asIs && longEdge <= limit) return asIs;
      return await redraw(
        image.element,
        image.naturalWidth,
        image.naturalHeight,
        Math.min(1, limit / longEdge),
        asIs?.format === 'png' ? 'png' : 'jpg',
        preset.jpegQuality,
        fileName,
      );
    } finally {
      image.release();
    }
  };
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
): Promise<PreparedImage> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new UserFacingError(`${fileName}: the photo couldn’t be resized.`);
  if (format === 'jpg') {
    context.fillStyle = '#fff'; // JPEG has no transparency
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, format === 'jpg' ? 'image/jpeg' : 'image/png', quality),
  );
  canvas.width = canvas.height = 0; // free the pixels right away
  if (!blob) throw new UserFacingError(`${fileName}: the photo couldn’t be resized.`);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), format, turn: 0 };
}
