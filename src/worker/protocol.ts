import type { CoverDetails } from '../pdf/cover';
import type { PacketSection } from '../pdf/buildPacket';

/** Messages between the page and the sealed PDF worker. */
export type WorkerRequest =
  | { readonly type: 'check-seal' }
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
  | { readonly type: 'progress'; readonly done: number; readonly total: number }
  | { readonly type: 'done'; readonly bytes: Uint8Array; readonly pageCount: number }
  | {
      readonly type: 'error';
      readonly message: string;
      readonly details: readonly string[];
      readonly expected: boolean;
    };

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Checks the shape of anything the worker sends before the page trusts it. */
export function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'seal-report':
      return isStringArray(message.exposed);
    case 'progress':
      return Number.isFinite(message.done) && Number.isFinite(message.total);
    case 'done':
      return message.bytes instanceof Uint8Array && Number.isInteger(message.pageCount);
    case 'error':
      return (
        typeof message.message === 'string' && isStringArray(message.details) && typeof message.expected === 'boolean'
      );
    default:
      return false;
  }
}
