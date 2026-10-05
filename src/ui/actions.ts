import { parseContactInfo } from '../core/contactInfo';
import { UserFacingError } from '../core/errors';
import { buildLibrary, type LibraryDocument } from '../core/library';
import { planPacket, type PlannedSection } from '../core/packet';
import { packetFileName } from '../core/naming';
import { getSizePreset, type SizePreset } from '../core/sizePresets';
import type { PickedFolder } from '../browser/readFolder';
import type { BuiltPacket, PacketDocument, PacketSection } from '../pdf/buildPacket';
import type { CoverDetails } from '../pdf/cover';
import type { ImagePreparer } from '../pdf/images';
import type { ImageSizeLimits } from '../worker/protocol';
import { currentFooter, type AppState, type ContactState, type Notice, type SizeReport } from './state';
import type { Store } from './store';

/** Everything that touches the browser, injected so actions can be tested. */
export interface Services {
  readonly createImagePreparer: (preset: SizePreset) => ImagePreparer;
  readonly buildPacket: (
    cover: CoverDetails,
    sections: readonly PacketSection[],
    onProgress: (done: number, total: number) => void,
    imageLimits: ImageSizeLimits | null,
  ) => Promise<BuiltPacket>;
  readonly saveFile: (bytes: Uint8Array, fileName: string) => void;
}

const MAX_CONTACT_FILE_BYTES = 64 * 1024;
/** Share of the progress bar spent reading files; the rest is building the PDF. */
const READING_SHARE = 0.25;

export function setAddress(store: Store<AppState>, address: string): void {
  store.update({ address });
}

/** Loads a picked or dropped folder, keeping any arrangement that still applies. */
export async function loadFolder(store: Store<AppState>, picking: Promise<PickedFolder>): Promise<void> {
  store.update({ folderLoading: true, folderError: null });
  try {
    const picked = await picking;
    const library = buildLibrary(picked.entries);
    if (library.options.length === 0) {
      throw new UserFacingError(
        `No usable documents in “${picked.name}”. Put PDFs or photos (JPG, PNG, HEIC) in it, either loose or in folders.`,
        library.ignored.map((item) =>
          item.exportSteps ? `${item.path}: save it as a PDF first (${item.exportSteps}).` : item.path,
        ),
      );
    }
    const contact = await readContactFile(library.contactFile);
    store.update((state) => ({
      folder: { name: picked.name, library, contact },
      packet: state.packet.filter((item) => library.options.some((option) => option.id === item.optionId)),
      folderLoading: false,
      build: { status: 'idle' },
    }));
  } catch (error) {
    store.update({
      folderLoading: false,
      folderError: toNotice(error, 'That folder couldn’t be read. Click “Choose folder…” and pick it again.'),
    });
  }
}

async function readContactFile(file: File | null): Promise<ContactState> {
  if (!file) return { status: 'missing' };
  if (file.size > MAX_CONTACT_FILE_BYTES) {
    return {
      status: 'unreadable',
      reason: 'contact-info.txt is much larger than expected. It should only hold names and contact details.',
    };
  }
  try {
    return { status: 'loaded', info: parseContactInfo(await file.text()) };
  } catch {
    return { status: 'unreadable', reason: 'contact-info.txt couldn’t be read. Check it’s a plain-text file.' };
  }
}

/** Reads the chosen files, prepares photos, builds the PDF in the sealed worker and saves it. */
export async function generate(store: Store<AppState>, services: Services): Promise<void> {
  const state = store.get();
  if (!state.folder || state.build.status === 'working') return;

  const sections = planPacket(state.folder.library, state.packet, state.today);
  if (sections.length === 0) {
    store.update({
      build: {
        status: 'error',
        message: 'Nothing to put in the packet yet. Drag at least one folder or file into the order.',
        details: [],
      },
    });
    return;
  }

  const working = (progress: number, label: string) => store.update({ build: { status: 'working', progress, label } });
  try {
    const preset = getSizePreset(state.sizePreset);
    const prepareImage = services.createImagePreparer(preset);
    const all = sections.flatMap((section) => section.documents.map((doc) => ({ section, doc })));
    const prepared = new Map<LibraryDocument<File>, PacketDocument>();
    const problems: string[] = [];

    for (const [index, { section, doc }] of all.entries()) {
      working((READING_SHARE * index) / all.length, 'Reading your files…');
      const label = `${section.title}/${doc.path}`;
      try {
        prepared.set(doc, await readDocument(doc, label, prepareImage));
      } catch (error) {
        problems.push(
          error instanceof UserFacingError
            ? error.message
            : `${label}: couldn’t be read. If it’s in iCloud, download it first (click the cloud icon in Finder).`,
        );
      }
    }
    if (problems.length > 0) throw new UserFacingError('Some files couldn’t be added.', problems);

    const packetSections: PacketSection[] = sections.map((section) => ({
      title: section.title,
      description: section.description,
      documents: section.documents.map((doc) => prepared.get(doc) as PacketDocument),
    }));
    const cover: CoverDetails = {
      address: state.address,
      applicants: state.folder.contact.status === 'loaded' ? state.folder.contact.info.applicants : [],
      footerText: currentFooter(state),
      preparedOn: state.today,
    };

    const imageLimits = { maxEdge: preset.maxImageEdge, quality: preset.jpegQuality };
    working(READING_SHARE, 'Building your packet…');
    const built = await services.buildPacket(
      cover,
      packetSections,
      (done, total) => working(READING_SHARE + (1 - READING_SHARE) * (done / total), 'Building your packet…'),
      imageLimits,
    );
    const fileName = packetFileName(state.address, state.today);
    services.saveFile(built.bytes, fileName);
    const sizeReport = reportSizes(sections, built);
    store.update({
      build: { status: 'done', fileName, pageCount: built.pageCount, byteLength: built.bytes.byteLength, sizeReport },
    });
  } catch (error) {
    store.update({ build: { status: 'error', ...toNotice(error, 'Something went wrong while building the PDF.') } });
  }
}

/** Each section's original file sizes next to the space it takes up in the packet. */
function reportSizes(sections: readonly PlannedSection<File>[], built: BuiltPacket): SizeReport {
  const report = sections.map((section, i) => ({
    title: section.title,
    before: section.documents.reduce((sum, doc) => sum + doc.file.size, 0),
    after: built.sectionBytes[i] ?? 0,
  }));
  return { sections: report.sort((a, b) => b.after - a.after), sharedSaved: built.cleanupSavings };
}

async function readDocument(
  doc: LibraryDocument<File>,
  label: string,
  prepareImage: ImagePreparer,
): Promise<PacketDocument> {
  const bytes = new Uint8Array(await doc.file.arrayBuffer());
  if (doc.kind !== 'image') return { label, kind: doc.kind, bytes };
  const image = await prepareImage(bytes, label);
  return { label, kind: 'image', bytes: image.bytes, image: { format: image.format, turn: image.turn } };
}

/**
 * Turns an error into something to show. Messages written for people are
 * shown as-is; anything else gets the fallback, with the browser's own text
 * labelled as a technical detail rather than presented as the explanation.
 */
function toNotice(error: unknown, fallback: string): Notice {
  if (error instanceof UserFacingError) return { message: error.message, details: error.details };
  const technical = error instanceof Error ? error.message.trim() : '';
  return { message: fallback, details: technical ? [`Technical detail: ${technical}`] : [] };
}
