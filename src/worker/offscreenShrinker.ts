import type { JpegShrinker } from '../pdf/shrinkImages';

/**
 * Shrinks a JPEG with the browser's own decoder and an OffscreenCanvas, all
 * inside the worker. Returns null where those aren't available, which simply
 * leaves the image as it was.
 */
export const shrinkJpegOffscreen: JpegShrinker = async (jpeg, maxEdge, quality) => {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  const bitmap = await createImageBitmap(new Blob([jpeg as BlobPart], { type: 'image/jpeg' }));
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    bitmap.close();
  }
};
