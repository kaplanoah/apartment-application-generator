import { describe, expect, it, vi } from 'vitest';
import { UserFacingError } from '../../src/core/errors';
import { newPacketItem } from '../../src/core/packet';
import type { PickedFolder } from '../../src/browser/readFolder';
import { generate, loadFolder, setAddress, setFooter, type Services } from '../../src/ui/actions';
import { initialState, type AppState } from '../../src/ui/state';
import { Store } from '../../src/ui/store';
import { prepareImageAsIs } from '../../src/pdf/images';
import { sampleIdJpeg, samplePdf } from '../../scripts/lib/sampleDocs';
import { TODAY } from '../support/library';

const file = (name: string, bytes: Uint8Array | string) => new File([bytes as BlobPart], name);

async function sampleFolder(): Promise<PickedFolder> {
  return {
    name: 'Docs',
    entries: [
      { path: ['contact-info.txt'], file: file('contact-info.txt', 'Name: Noah\nEmail: n@x') },
      { path: ['Cover Letter.pdf'], file: file('Cover Letter.pdf', await samplePdf('Cover')) },
      { path: ['ID', 'license.jpg'], file: file('license.jpg', sampleIdJpeg()) },
      { path: ['Stubs', '2026-09-18.pdf'], file: file('2026-09-18.pdf', await samplePdf('Stub')) },
    ],
  };
}

const newStore = () => new Store<AppState>(initialState(TODAY));

function fakeServices(): Services & { saved: { bytes: Uint8Array; fileName: string }[] } {
  const saved: { bytes: Uint8Array; fileName: string }[] = [];
  return {
    saved,
    createImagePreparer: () => prepareImageAsIs,
    buildPacket: vi.fn<Services['buildPacket']>(async (_cover, sections, onProgress) => {
      onProgress(1, 1);
      return { bytes: new Uint8Array(1234), pageCount: 1 + sections.reduce((n, s) => n + s.documents.length, 0) };
    }),
    saveFile: (bytes, fileName) => saved.push({ bytes, fileName }),
  };
}

describe('details', () => {
  it('suggests the footer from the address until it is edited', () => {
    const store = newStore();
    setAddress(store, '1 Elm St');
    expect(store.get().footer).toBe('For 1 Elm St application only · Oct 2026');
    setFooter(store, 'Custom');
    setAddress(store, '2 Oak Ave');
    expect(store.get().footer).toBe('Custom');
  });
});

describe('loadFolder', () => {
  it('builds the library and reads the contact file', async () => {
    const store = newStore();
    await loadFolder(store, sampleFolder());
    const { folder, folderError, folderLoading } = store.get();
    expect(folderError).toBeNull();
    expect(folderLoading).toBe(false);
    expect(folder?.library.options.map((o) => o.title)).toEqual(['Cover Letter', 'ID', 'Stubs']);
    expect(folder?.contact).toEqual({
      status: 'loaded',
      info: { applicants: [{ name: 'Noah', details: [{ label: 'Email', value: 'n@x' }] }], problems: [] },
    });
  });

  it('keeps the arrangement when the same folder is added again', async () => {
    const store = newStore();
    await loadFolder(store, sampleFolder());
    const options = store.get().folder?.library.options ?? [];
    store.update({
      packet: [newPacketItem(options[2]!), newPacketItem(options[0]!), { optionId: 'Gone/', range: { kind: 'all' } }],
    });
    await loadFolder(store, sampleFolder());
    expect(store.get().packet.map((item) => item.optionId)).toEqual(['Stubs/', 'Cover Letter.pdf']);
  });

  it('reports a missing contact file and unreadable folders', async () => {
    const store = newStore();
    await loadFolder(store, Promise.resolve({ name: 'D', entries: [{ path: ['a.pdf'], file: file('a.pdf', 'x') }] }));
    expect(store.get().folder?.contact).toEqual({ status: 'missing' });

    await loadFolder(store, Promise.reject(new UserFacingError('That’s a file.')));
    expect(store.get().folderError).toEqual({ message: 'That’s a file.', details: [] });
    expect(store.get().folder).not.toBeNull(); // the previous folder stays usable

    await loadFolder(
      store,
      Promise.resolve({ name: 'Junk', entries: [{ path: ['notes.txt'], file: file('notes.txt', 'x') }] }),
    );
    expect(store.get().folderError?.message).toMatch(/No usable documents in “Junk”/);
    expect(store.get().folderError?.details).toEqual(['notes.txt']);
  });

  it('refuses an unexpectedly large contact file', async () => {
    const store = newStore();
    const big = file('contact-info.txt', 'x'.repeat(70_000));
    await loadFolder(
      store,
      Promise.resolve({
        name: 'D',
        entries: [
          { path: ['contact-info.txt'], file: big },
          { path: ['a.pdf'], file: file('a.pdf', 'x') },
        ],
      }),
    );
    expect(store.get().folder?.contact.status).toBe('unreadable');
  });
});

describe('generate', () => {
  it('reads files, builds in order and saves with a safe name', async () => {
    const store = newStore();
    const services = fakeServices();
    setAddress(store, '123 Main St, Apt 4B');
    await loadFolder(store, sampleFolder());
    const options = store.get().folder?.library.options ?? [];
    store.update({ packet: [newPacketItem(options[2]!), newPacketItem(options[1]!), newPacketItem(options[0]!)] });

    await generate(store, services);

    expect(store.get().build).toMatchObject({
      status: 'done',
      fileName: 'Rental Application - 123 Main St Apt 4B - 2026-10-04.pdf',
      pageCount: 4,
      byteLength: 1234,
    });
    expect(services.saved.map((s) => s.fileName)).toEqual(['Rental Application - 123 Main St Apt 4B - 2026-10-04.pdf']);
    const [cover, sections] = (services.buildPacket as ReturnType<typeof vi.fn>).mock.calls[0] as [
      unknown,
      { title: string; documents: { kind: string; image?: unknown }[] }[],
    ];
    expect(cover).toMatchObject({
      address: '123 Main St, Apt 4B',
      applicants: [{ name: 'Noah' }],
      footerText: 'For 123 Main St, Apt 4B application only · Oct 2026',
    });
    expect(sections.map((s) => s.title)).toEqual(['Stubs', 'ID', 'Cover Letter']);
    expect(sections[1]?.documents[0]).toMatchObject({ kind: 'image', image: { format: 'jpg', turn: 0 } });
  });

  it('explains when there is nothing to build', async () => {
    const store = newStore();
    await loadFolder(store, sampleFolder());
    await generate(store, fakeServices());
    expect(store.get().build).toMatchObject({
      status: 'error',
      message: expect.stringMatching(/Nothing to put in the packet/),
    });
  });

  it('collects photo problems and shows builder errors', async () => {
    const store = newStore();
    await loadFolder(store, sampleFolder());
    const options = store.get().folder?.library.options ?? [];
    store.update({ packet: [newPacketItem(options[1]!)] });

    const failingPhotos = {
      ...fakeServices(),
      createImagePreparer: () => () => Promise.reject(new UserFacingError('ID/license.jpg: can’t open')),
    };
    await generate(store, failingPhotos);
    expect(store.get().build).toEqual({
      status: 'error',
      message: 'Some files couldn’t be added.',
      details: ['ID/license.jpg: can’t open'],
    });

    const crashing = { ...fakeServices(), buildPacket: () => Promise.reject(new Error('boom')) };
    await generate(store, crashing);
    expect(store.get().build).toEqual({
      status: 'error',
      message: 'Something went wrong while building the PDF.',
      details: ['boom'],
    });
  });
});
