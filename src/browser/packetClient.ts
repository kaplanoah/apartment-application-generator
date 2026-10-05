import { UserFacingError } from '../core/errors';
import type { BuiltPacket, PacketSection } from '../pdf/buildPacket';
import type { CoverDetails } from '../pdf/cover';
import type { ImageShrinker } from '../pdf/shrinkImages';
import { isWorkerResponse, type ImageSizeLimits, type WorkerRequest, type WorkerResponse } from '../worker/protocol';
import PacketWorker from '../worker/packetWorker?worker&inline';
import { shrinkPdfImage } from './imagePreparer';

export type WorkerFactory = () => Worker;

/**
 * Builds a packet in a fresh, sealed worker (pdf-lib never runs on the page).
 * The worker must first prove it has no network or storage APIs; if it
 * can't, nothing is built. The worker is discarded afterwards, freeing every
 * copy of the documents it held.
 */
export async function buildPacketInWorker(
  cover: CoverDetails,
  sections: readonly PacketSection[],
  onProgress: (done: number, total: number) => void,
  imageLimits: ImageSizeLimits | null = null,
  shrinkImage: ImageShrinker = shrinkPdfImage,
  createWorker: WorkerFactory = () => new PacketWorker(),
): Promise<BuiltPacket> {
  const worker = createWorker();
  try {
    const listeners = { onProgress, shrinkImage };
    const seal = await request(worker, { type: 'check-seal' }, [], listeners);
    if (seal.type !== 'seal-report' || seal.exposed.length > 0) {
      throw new UserFacingError(
        'Safety check failed: the PDF builder could reach the network, so nothing was built.',
        seal.type === 'seal-report' ? [...seal.exposed] : [],
      );
    }
    const transfer = sections.flatMap((section) => section.documents.map((doc) => doc.bytes.buffer as ArrayBuffer));
    const result = await request(worker, { type: 'build', cover, sections, imageLimits }, transfer, listeners);
    if (result.type !== 'done') throw new Error('Unexpected reply from the PDF builder.');
    const { bytes, pageCount, sectionBytes, cleanupSavings } = result;
    return { bytes, pageCount, sectionBytes, cleanupSavings };
  } finally {
    worker.terminate();
  }
}

interface Listeners {
  readonly onProgress: (done: number, total: number) => void;
  readonly shrinkImage: ImageShrinker;
}

/** Sends one request, answers progress and image requests, and resolves with the final reply. */
function request(
  worker: Worker,
  message: WorkerRequest,
  transfer: Transferable[],
  { onProgress, shrinkImage }: Listeners,
): Promise<Exclude<WorkerResponse, { type: 'progress' | 'error' | 'shrink-image' }>> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const reply = event.data;
      if (!isWorkerResponse(reply)) {
        reject(new Error('The PDF builder sent an unexpected message.'));
      } else if (reply.type === 'progress') {
        onProgress(reply.done, reply.total);
      } else if (reply.type === 'shrink-image') {
        void answerShrink(worker, reply, shrinkImage);
      } else if (reply.type === 'error') {
        reject(
          reply.expected
            ? new UserFacingError(reply.message, reply.details)
            : new Error(reply.details.join('\n') || reply.message),
        );
      } else {
        resolve(reply);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      reject(new Error(event.message || 'The PDF builder stopped unexpectedly.'));
    };
    worker.postMessage(message, transfer);
  });
}

async function answerShrink(
  worker: Worker,
  { id, source, maxEdge, quality }: Extract<WorkerResponse, { type: 'shrink-image' }>,
  shrinkImage: ImageShrinker,
): Promise<void> {
  const image = await shrinkImage(source, maxEdge, quality).catch(() => null);
  const reply: WorkerRequest = { type: 'shrunk-image', id, image };
  worker.postMessage(reply, image ? [image.bytes.buffer as ArrayBuffer] : []);
}
