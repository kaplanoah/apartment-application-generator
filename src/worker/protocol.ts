import type { CoverDetails } from '../pdf/cover';
import type { PacketSection } from '../pdf/buildPacket';
import { readJpegSize } from '../pdf/jpegSize';
import { MAX_SHRINK_PIXELS, type ImageSource, type ShrunkImage } from '../pdf/shrinkImages';

/** Messages between the page and the sealed PDF worker. */
export type WorkerRequest =
  | { readonly type: 'check-seal' }
  /** The page's answer to a 'shrink-image' request: a smaller JPEG, or null to keep the original. */
  | { readonly type: 'shrunk-image'; readonly id: number; readonly image: ShrunkImage | null }
  | {
      readonly type: 'build';
      readonly cover: CoverDetails;
      readonly sections: readonly PacketSection[];
      /** Shrink photos and scans inside PDFs to this size, or keep them (null). */
      readonly imageLimits: ImageSizeLimits | null;
    };

export interface ImageSizeLimits {
  readonly maxEdge: number;
  readonly quality: number;
}

export type WorkerResponse =
  | { readonly type: 'seal-report'; readonly exposed: readonly string[] }
  /**
   * Asks the page to re-encode an image found inside a PDF. The page's canvas makes JPEGs
   * reliably in every browser, which a worker's OffscreenCanvas doesn't in WebKit.
   */
  | {
      readonly type: 'shrink-image';
      readonly id: number;
      readonly source: ImageSource;
      readonly maxEdge: number;
      readonly quality: number;
    }
  | { readonly type: 'progress'; readonly done: number; readonly total: number }
  | {
      readonly type: 'done';
      readonly bytes: Uint8Array;
      readonly pageCount: number;
      readonly sectionBytes: readonly number[];
      readonly cleanupSavings: number;
    }
  | {
      readonly type: 'error';
      readonly message: string;
      readonly details: readonly string[];
      readonly expected: boolean;
    };

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * A JPEG must state a size the page will draw. Pixels must be exactly as many as their stated
 * size, and within that size too.
 */
function isImageSource(value: unknown): value is ImageSource {
  if (typeof value !== 'object' || value === null) return false;
  const source = value as Record<string, unknown>;
  if (!(source.bytes instanceof Uint8Array)) return false;
  if (source.kind === 'jpeg') {
    const size = readJpegSize(source.bytes);
    return size !== null && size.width * size.height <= MAX_SHRINK_PIXELS;
  }
  if (source.kind !== 'pixels') return false;
  const { width, height, channels } = source;
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    (width as number) > 0 &&
    (height as number) > 0 &&
    (width as number) * (height as number) <= MAX_SHRINK_PIXELS &&
    (channels === 1 || channels === 3) &&
    source.bytes.byteLength === (width as number) * (height as number) * channels
  );
}

/** Checks the shape of anything the worker sends before the page trusts it. */
export function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'seal-report':
      return isStringArray(message.exposed);
    case 'progress':
      return Number.isFinite(message.done) && Number.isFinite(message.total);
    case 'shrink-image':
      return (
        Number.isInteger(message.id) &&
        isImageSource(message.source) &&
        Number.isFinite(message.maxEdge) &&
        Number.isFinite(message.quality)
      );
    case 'done':
      return (
        message.bytes instanceof Uint8Array &&
        Number.isInteger(message.pageCount) &&
        Array.isArray(message.sectionBytes) &&
        message.sectionBytes.every((value) => Number.isFinite(value)) &&
        Number.isFinite(message.cleanupSavings)
      );
    case 'error':
      return (
        typeof message.message === 'string' && isStringArray(message.details) && typeof message.expected === 'boolean'
      );
    default:
      return false;
  }
}
