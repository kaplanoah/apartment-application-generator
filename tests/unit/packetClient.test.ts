import { describe, expect, it, vi } from 'vitest';
import { buildPacketInWorker } from '../../src/browser/packetClient';
import { UserFacingError } from '../../src/core/errors';
import type { CoverDetails } from '../../src/pdf/cover';
import type { WorkerRequest, WorkerResponse } from '../../src/worker/protocol';

// The real worker is bundled by Vite; these tests use a stand-in that answers like it.
vi.mock('../../src/worker/packetWorker?worker&inline', () => ({ default: vi.fn() }));

/** A worker that answers each request with `answer`, and records what it was sent. */
function fakeWorker(answer: (request: WorkerRequest) => WorkerResponse) {
  const received: WorkerRequest['type'][] = [];
  const worker = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onerror: null,
    terminated: false,
    postMessage(request: WorkerRequest) {
      received.push(request.type);
      queueMicrotask(() => worker.onmessage?.({ data: answer(request) }));
    },
    terminate() {
      worker.terminated = true;
    },
  };
  return { worker, received, create: () => worker as unknown as Worker };
}

const cover: CoverDetails = {
  address: '123 Main St',
  applicants: [{ name: 'Alex Sample', details: [] }],
  footerText: 'Alex Sample · Application for 123 Main St · Oct 2026',
  preparedOn: { year: 2026, month: 10, day: 4 },
};
const build = (create: () => Worker) =>
  buildPacketInWorker(
    cover,
    [],
    () => {},
    null,
    async () => null,
    create,
  );

describe('buildPacketInWorker', () => {
  it('refuses to build when the worker can still reach the network', async () => {
    const { worker, received, create } = fakeWorker(() => ({ type: 'seal-report', exposed: ['fetch'] }));
    const result = build(create);
    await expect(result).rejects.toThrow(UserFacingError);
    await expect(result).rejects.toThrow(/Safety check failed/);
    expect(received).toEqual(['check-seal']);
    expect(worker.terminated).toBe(true);
  });

  it('builds once the worker proves it is sealed, then discards it', async () => {
    const { worker, received, create } = fakeWorker((request) =>
      request.type === 'check-seal'
        ? { type: 'seal-report', exposed: [] }
        : { type: 'done', bytes: new Uint8Array([1]), pageCount: 1, sectionBytes: [], cleanupSavings: 0 },
    );
    await expect(build(create)).resolves.toMatchObject({ pageCount: 1 });
    expect(received).toEqual(['check-seal', 'build']);
    expect(worker.terminated).toBe(true);
  });

  it('rejects a malformed reply instead of trusting it', async () => {
    const { received, create } = fakeWorker(() => ({ type: 'seal-report', exposed: 'none' }) as never);
    await expect(build(create)).rejects.toThrow('unexpected message');
    expect(received).toEqual(['check-seal']);
  });
});
