/// <reference lib="webworker" />
// Order matters: seal the worker before anything else is evaluated.
import './sealOnLoad';
import { UserFacingError } from '../core/errors';
import { buildPacket } from '../pdf/buildPacket';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { shrinkJpegOffscreen } from './offscreenShrinker';
import { exposedGlobals } from './seal';

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
const reply = (message: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'check-seal') {
    reply({ type: 'seal-report', exposed: exposedGlobals(globalThis) });
    return;
  }
  if (request.type !== 'build') return;

  try {
    const packet = await buildPacket(request.cover, request.sections, {
      onProgress: (done, total) => reply({ type: 'progress', done, total }),
      imageLimits: request.imageLimits ? { ...request.imageLimits, shrink: shrinkJpegOffscreen } : undefined,
    });
    reply({ type: 'done', bytes: packet.bytes, pageCount: packet.pageCount }, [packet.bytes.buffer as ArrayBuffer]);
  } catch (error) {
    const expected = error instanceof UserFacingError;
    reply({
      type: 'error',
      expected,
      message: expected ? error.message : 'Something went wrong while building the PDF.',
      details: expected ? [...error.details] : [error instanceof Error ? error.message : String(error)],
    });
  }
};
