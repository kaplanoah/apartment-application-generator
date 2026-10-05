/// <reference lib="webworker" />
// Order matters: seal the worker before anything else is evaluated.
import './sealOnLoad';
import { UserFacingError } from '../core/errors';
import { buildPacket } from '../pdf/buildPacket';
import type { ImageShrinker, ShrunkImage } from '../pdf/shrinkImages';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { exposedGlobals } from './seal';

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
const reply = (message: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

const pendingShrinks = new Map<number, (image: ShrunkImage | null) => void>();
let nextShrinkId = 1;

/** Has the page re-encode an image; the answer arrives as a 'shrunk-image' message. */
const askPageToShrink: ImageShrinker = (source, maxEdge, quality) =>
  new Promise((resolve) => {
    const id = nextShrinkId++;
    pendingShrinks.set(id, resolve);
    // Sent in a buffer of its own, which is handed over: the original stays in the PDF until replaced.
    const sent = { ...source, bytes: source.bytes.slice() };
    reply({ type: 'shrink-image', id, source: sent, maxEdge, quality }, [sent.bytes.buffer as ArrayBuffer]);
  });

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'shrunk-image') {
    pendingShrinks.get(request.id)?.(request.image);
    pendingShrinks.delete(request.id);
    return;
  }
  if (request.type === 'check-seal') {
    reply({ type: 'seal-report', exposed: exposedGlobals(globalThis) });
    return;
  }
  if (request.type !== 'build') return;

  try {
    const packet = await buildPacket(request.cover, request.sections, {
      onProgress: (done, total) => reply({ type: 'progress', done, total }),
      imageLimits: request.imageLimits ? { ...request.imageLimits, shrink: askPageToShrink } : undefined,
    });
    reply({ type: 'done', ...packet }, [packet.bytes.buffer as ArrayBuffer]);
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
