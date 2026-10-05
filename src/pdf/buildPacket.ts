import { degrees, PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { UserFacingError } from '../core/errors';
import type { DocumentKind } from '../core/fileTypes';
import { drawCover, planCover, type ContentsEntry, type CoverDetails } from './cover';
import { CONTENTS_SPAN } from './coverLayout';
import { stampFooters } from './footer';
import { fitImage, pageSizeForImage } from './geometry';
import type { PreparedImage } from './images';
import { addOutline, addPageLink } from './navigation';
import { makeTextSanitizer } from './text';
import { drawTextPages, paginate, TEXT_LAYOUT, wrapText } from './textPages';

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
}

export type ProgressListener = (done: number, total: number) => void;

const IMAGE_MARGIN = 36;
const PRODUCER = 'Apartment Packet Builder';
const MAX_TEXT_BYTES = 512 * 1024;

type LoadedDocument =
  | { readonly kind: 'pdf'; readonly pdf: PDFDocument; readonly pageCount: number }
  | { readonly kind: 'image'; readonly bytes: Uint8Array; readonly image: Omit<PreparedImage, 'bytes'> }
  | { readonly kind: 'text'; readonly pages: readonly string[][] };

interface Fonts {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  readonly sanitize: (text: string) => string;
}

/**
 * Assembles the packet: cover with contents, then every section's pages in
 * order, with links, bookmarks and a footer on every page.
 *
 * All source files are checked before anything is built, so one bad file
 * produces a single error listing every problem at once.
 */
export async function buildPacket(
  cover: CoverDetails,
  sections: readonly PacketSection[],
  onProgress: ProgressListener = () => {},
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
      const result = await loadDocument(document, fonts);
      if (typeof result === 'string') problems.push(`${document.label}: ${result}`);
      else list.push(result);
      onProgress(++done, total);
    }
    loaded.push(list);
  }
  if (problems.length > 0) {
    throw new UserFacingError(
      problems.length === 1 ? 'One file couldn’t be added.' : `${problems.length} files couldn’t be added.`,
      problems,
    );
  }

  const layout = planCover(cover, sections.length);
  let nextPage = layout.pageCount + 1;
  const entries: ContentsEntry[] = sections.map((section, i) => {
    const entry = { title: section.title, description: section.description, pageNumber: nextPage };
    nextPage += (loaded[i] ?? []).reduce((sum, item) => sum + pagesOf(item), 0);
    return entry;
  });
  const { entryRows } = drawCover(doc, layout, cover, entries, fonts);

  const sectionStarts: PDFPage[] = [];
  for (const items of loaded) {
    let first: PDFPage | undefined;
    for (const item of items) {
      const added =
        item.kind === 'pdf'
          ? await appendPdf(doc, item.pdf)
          : item.kind === 'text'
            ? drawTextPages(doc, regular, item.pages)
            : await appendImage(doc, item);
      first ??= added;
    }
    if (first) sectionStarts.push(first);
  }

  entryRows.forEach((row, i) => {
    const target = sectionStarts[i];
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
      const page = sectionStarts[i];
      return page ? [{ title: section.title, page }] : [];
    }),
  );
  stampFooters(doc, regular, fonts.sanitize(cover.footerText));

  const bytes = await doc.save({ useObjectStreams: true });
  onProgress(total, total);
  return { bytes, pageCount: doc.getPageCount() };
}

const pagesOf = (item: LoadedDocument): number =>
  item.kind === 'pdf' ? item.pageCount : item.kind === 'text' ? item.pages.length : 1;

async function loadDocument(document: PacketDocument, fonts: Fonts): Promise<LoadedDocument | string> {
  if (document.kind === 'text') return loadText(document.bytes, fonts);
  if (document.kind === 'image') {
    if (!document.image) return 'the photo wasn’t prepared.';
    return { kind: 'image', bytes: document.bytes, image: document.image };
  }
  let pdf: PDFDocument;
  try {
    // Loaded with ignoreEncryption so encryption can be checked explicitly
    // (pdf-lib's error classes don't survive `instanceof`).
    pdf = await PDFDocument.load(document.bytes, { updateMetadata: false, ignoreEncryption: true });
  } catch {
    return 'it couldn’t be read as a PDF. Try opening it in Preview and exporting it again.';
  }
  if (pdf.isEncrypted) {
    return 'it’s password-protected. Open it in Preview, choose File → Export as PDF, and use the exported copy.';
  }
  const pageCount = pdf.getPageCount();
  return pageCount > 0 ? { kind: 'pdf', pdf, pageCount } : 'the PDF has no pages.';
}

function loadText(bytes: Uint8Array, fonts: Fonts): LoadedDocument | string {
  if (bytes.byteLength > MAX_TEXT_BYTES) return 'the text file is too long for the packet. Save it as a PDF instead.';
  // Sanitize line by line: the sanitizer flattens line breaks.
  const text = new TextDecoder('utf-8')
    .decode(bytes)
    .split(/\r\n|\r|\n/)
    .map((line) => fonts.sanitize(line.replace(/\t/g, '    ')))
    .join('\n')
    .trim();
  if (!text) return 'the text file is empty.';
  const width = 612 - TEXT_LAYOUT.margin * 2;
  return { kind: 'text', pages: paginate(wrapText(text, fonts.regular, TEXT_LAYOUT.size, width)) };
}

async function appendPdf(doc: PDFDocument, source: PDFDocument): Promise<PDFPage> {
  const pages = await doc.copyPages(source, source.getPageIndices());
  pages.forEach((page) => doc.addPage(page));
  return pages[0] as PDFPage;
}

async function appendImage(doc: PDFDocument, item: Extract<LoadedDocument, { kind: 'image' }>): Promise<PDFPage> {
  const image = item.image.format === 'jpg' ? await doc.embedJpg(item.bytes) : await doc.embedPng(item.bytes);
  const size = pageSizeForImage(image.width, image.height, item.image.turn);
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
  return page;
}
