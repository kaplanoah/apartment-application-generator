import { degrees, PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { UserFacingError } from '../core/errors';
import type { DocumentKind } from '../core/fileTypes';
import { cleanUpPacket } from './cleanup';
import { measurePageGroups } from './measure';
import { drawCover, planCover, type ContentsEntry, type CoverDetails } from './cover';
import { CONTENTS_SPAN } from './coverLayout';
import { stampFooters } from './footer';
import { choosePageSizeForImage, fitImage } from './geometry';
import type { PreparedImage } from './images';
import { addOutline, addPageLink } from './navigation';
import { detachPageLinks, reattachPageLinks } from './pageLinks';
import { shrinkPdfImages, type ImageLimits } from './shrinkImages';
import { makeTextSanitizer } from './text';
import { decodeText, drawTextPages, layoutTextPages } from './textPages';

export interface PacketDocument {
  /** Shown in error messages, e.g. "Pay Stubs/Alex/2026-09-18.pdf". */
  readonly label: string;
  readonly kind: DocumentKind;
  /** PDF bytes, UTF-8 text, or an image already converted to JPEG/PNG. */
  readonly bytes: Uint8Array;
  readonly image?: Omit<PreparedImage, 'bytes'>;
}

export interface PacketSection {
  readonly title: string;
  readonly description: string | null;
  readonly documents: readonly PacketDocument[];
}

export interface BuiltPacket {
  readonly bytes: Uint8Array;
  readonly pageCount: number;
  /** Roughly how many bytes each section takes up in the packet; shared parts are counted once. */
  readonly sectionBytes: readonly number[];
  /** Bytes saved across the packet by the lossless clean-up (shared duplicates and such). */
  readonly cleanupSavings: number;
}

type ProgressListener = (done: number, total: number) => void;

export interface BuildOptions {
  readonly onProgress?: ProgressListener;
  /** Shrink oversized photos and scans inside PDFs to these limits; omit to keep them. */
  readonly imageLimits?: ImageLimits;
}

const IMAGE_MARGIN = 36;
const PRODUCER = 'Apartment Packet Builder';
const MAX_TEXT_BYTES = 512 * 1024;
const ONE_FILE_FAILED = 'One file couldn’t be added.';

type LoadedDocument = { readonly label: string } & (
  | { readonly kind: 'pdf'; readonly pdf: PDFDocument; readonly pageCount: number }
  | { readonly kind: 'image'; readonly bytes: Uint8Array; readonly image: Omit<PreparedImage, 'bytes'> }
  | { readonly kind: 'text'; readonly pages: readonly string[][] }
);

const UNREADABLE: Readonly<Record<LoadedDocument['kind'], string>> = {
  pdf: 'it couldn’t be read as a PDF. Try opening it in Preview and exporting it again.',
  image: 'the photo couldn’t be read. Try opening it in Preview and exporting it again as a JPEG.',
  text: 'the text couldn’t be laid out. Try saving it as a PDF instead.',
};

interface Fonts {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  readonly sanitize: (text: string) => string;
}

/**
 * Assembles the packet: cover with contents, then every section's pages in
 * order, with links, bookmarks and a footer on every page.
 *
 * All source files are checked before anything is built, so a single error
 * lists every problem at once. A file that still fails while it's being added
 * stops the build with an error naming it.
 */
export async function buildPacket(
  cover: CoverDetails,
  sections: readonly PacketSection[],
  { onProgress = () => {}, imageLimits }: BuildOptions = {},
): Promise<BuiltPacket> {
  const total = sections.reduce((sum, section) => sum + section.documents.length, 0) + 1;
  let done = 0;

  const doc = await PDFDocument.create();
  doc.setTitle(cover.address.trim() ? `Rental Application – ${cover.address.trim()}` : 'Rental Application');
  doc.setCreator(PRODUCER);
  doc.setProducer(PRODUCER);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold, sanitize: makeTextSanitizer(regular) };

  const problems: string[] = [];
  const loaded: LoadedDocument[][] = [];
  for (const section of sections) {
    const list: LoadedDocument[] = [];
    for (const document of section.documents) {
      const result = await loadDocument(document, fonts, imageLimits);
      if (typeof result === 'string') problems.push(`${document.label}: ${result}`);
      else list.push(result);
      onProgress(++done, total);
    }
    loaded.push(list);
  }
  if (problems.length > 0) {
    throw new UserFacingError(
      problems.length === 1 ? ONE_FILE_FAILED : `${problems.length} files couldn’t be added.`,
      problems,
    );
  }

  const layout = planCover(cover, sections.length);
  let nextPage = layout.pageCount + 1;
  const entries: ContentsEntry[] = sections.map((section, i) => {
    const entry = { title: section.title, description: section.description, pageNumber: nextPage };
    nextPage += (loaded[i] ?? []).reduce((sum, item) => sum + countPages(item), 0);
    return entry;
  });
  const { entryRows } = drawCover(doc, layout, cover, entries, fonts);

  const sectionPages: PDFPage[][] = [];
  for (const items of loaded) {
    const start = doc.getPageCount();
    for (const item of items) await appendDocument(doc, item, regular);
    sectionPages.push(doc.getPages().slice(start));
  }

  entryRows.forEach((row, i) => {
    const target = sectionPages[i]?.[0];
    if (target) {
      const rect = {
        x: CONTENTS_SPAN.left - 2,
        y: row.y - 5,
        width: CONTENTS_SPAN.right - CONTENTS_SPAN.left + 4,
        height: 18,
      };
      addPageLink(doc, row.page, rect, target);
    }
  });
  addOutline(
    doc,
    sections.flatMap((section, i) => {
      const page = sectionPages[i]?.[0];
      return page ? [{ title: section.title, page }] : [];
    }),
  );
  stampFooters(doc, regular, fonts.sanitize(cover.footerText));
  await doc.flush();
  const cleanupSavings = cleanUpPacket(doc);
  const sectionBytes = measurePageGroups(doc, sectionPages);

  const bytes = await doc.save({ useObjectStreams: true });
  onProgress(total, total);
  return { bytes, pageCount: doc.getPageCount(), sectionBytes, cleanupSavings };
}

const countPages = (item: LoadedDocument): number =>
  item.kind === 'pdf' ? item.pageCount : item.kind === 'text' ? item.pages.length : 1;

async function loadDocument(
  document: PacketDocument,
  fonts: Fonts,
  imageLimits: ImageLimits | undefined,
): Promise<LoadedDocument | string> {
  const { label } = document;
  if (document.kind === 'text') return loadText(label, document.bytes, fonts);
  if (document.kind === 'image') {
    if (!document.image) return 'the photo wasn’t prepared.';
    return { kind: 'image', label, bytes: document.bytes, image: document.image };
  }
  let pdf: PDFDocument;
  try {
    // Loaded with ignoreEncryption so encryption can be checked explicitly
    // (pdf-lib's error classes don't survive `instanceof`).
    pdf = await PDFDocument.load(document.bytes, { updateMetadata: false, ignoreEncryption: true });
  } catch {
    return UNREADABLE.pdf;
  }
  if (pdf.isEncrypted) {
    return 'it’s password-protected. Open it in Preview, choose File → Export as PDF, and use the exported copy.';
  }
  try {
    // Reads what the packet needs from every page, which throws if the page tree is broken.
    for (const page of pdf.getPages()) {
      page.getCropBox();
      page.getRotation();
    }
    detachPageLinks(pdf);
  } catch {
    return UNREADABLE.pdf;
  }
  const pageCount = pdf.getPageCount();
  if (pageCount === 0) return 'the PDF has no pages.';
  if (imageLimits) await shrinkPdfImages(pdf, imageLimits);
  return { kind: 'pdf', label, pdf, pageCount };
}

function loadText(label: string, bytes: Uint8Array, fonts: Fonts): LoadedDocument | string {
  if (bytes.byteLength > MAX_TEXT_BYTES) return 'the text file is too long for the packet. Save it as a PDF instead.';
  const pages = layoutTextPages(decodeText(bytes), fonts.regular, fonts.sanitize);
  if (pages.length === 0) return 'the text file is empty.';
  return { kind: 'text', label, pages };
}

async function appendDocument(doc: PDFDocument, item: LoadedDocument, font: PDFFont): Promise<void> {
  try {
    if (item.kind === 'pdf') await appendPdf(doc, item.pdf);
    else if (item.kind === 'text') drawTextPages(doc, font, item.pages);
    else await appendImage(doc, item);
  } catch {
    throw new UserFacingError(ONE_FILE_FAILED, [`${item.label}: ${UNREADABLE[item.kind]}`]);
  }
}

async function appendPdf(doc: PDFDocument, source: PDFDocument): Promise<void> {
  const pages = await doc.copyPages(source, source.getPageIndices());
  pages.forEach((page) => doc.addPage(page));
  reattachPageLinks(pages);
}

async function appendImage(doc: PDFDocument, item: Extract<LoadedDocument, { kind: 'image' }>): Promise<void> {
  const image = item.image.format === 'jpg' ? await doc.embedJpg(item.bytes) : await doc.embedPng(item.bytes);
  const size = choosePageSizeForImage(image.width, image.height, item.image.turn);
  const page = doc.addPage([size.width, size.height]);
  const area = {
    x: IMAGE_MARGIN,
    y: IMAGE_MARGIN + 12, // keep clear of the footer
    width: size.width - IMAGE_MARGIN * 2,
    height: size.height - IMAGE_MARGIN * 2 - 12,
  };
  const spot = fitImage(image.width, image.height, item.image.turn, area);
  page.drawImage(image, {
    x: spot.x,
    y: spot.y,
    width: spot.width,
    height: spot.height,
    rotate: degrees(spot.rotate),
  });
}
