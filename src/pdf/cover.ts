import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatDate, type CalendarDate } from '../core/calendar';
import { formatContactDetail, type Applicant } from '../core/contactInfo';
import { COVER, layoutCover, type CoverLayout } from './coverLayout';
import { LETTER } from './geometry';
import { fitText } from './text';

export interface CoverDetails {
  readonly address: string;
  readonly applicants: readonly Applicant[];
  readonly footerText: string;
  readonly preparedOn: CalendarDate;
}

export interface ContentsEntry {
  readonly title: string;
  readonly description: string | null;
  /** 1-based page number where the section starts. */
  readonly pageNumber: number;
}

export interface CoverFonts {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  readonly sanitize: (text: string) => string;
}

const INK = rgb(0.11, 0.13, 0.19);
const MUTED = rgb(0.4, 0.44, 0.52);
const LINE = rgb(0.85, 0.86, 0.89);

export function planCover(details: CoverDetails, entryCount: number): CoverLayout {
  return layoutCover({
    hasAddress: details.address.trim() !== '',
    applicantDetailCounts: details.applicants.map((applicant) => applicant.details.length),
    entryCount,
  });
}

/** Draws the cover pages and returns them, plus where each contents entry sits. */
export function drawCover(
  doc: PDFDocument,
  layout: CoverLayout,
  details: CoverDetails,
  entries: readonly ContentsEntry[],
  fonts: CoverFonts,
): { pages: PDFPage[]; entryRows: { page: PDFPage; y: number }[] } {
  const pages = Array.from({ length: layout.pageCount }, () => doc.addPage([LETTER.width, LETTER.height]));
  const pageAt = (index: number): PDFPage => pages[index] as PDFPage;
  const { regular, bold, sanitize } = fonts;
  const write = (
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont,
    maxWidth: number,
    color = INK,
  ) => page.drawText(fitText(sanitize(text), font, size, maxWidth), { x, y, size, font, color });

  const first = pageAt(0);
  write(first, 'Rental Application', layout.title.x, layout.title.y, COVER.titleSize, bold, COVER.contentWidth);
  if (layout.address) {
    write(
      first,
      details.address.trim(),
      layout.address.x,
      layout.address.y,
      COVER.addressSize,
      regular,
      COVER.contentWidth,
      MUTED,
    );
  }
  write(
    first,
    `Prepared ${formatDate(details.preparedOn)}`,
    layout.prepared.x,
    layout.prepared.y,
    COVER.metaSize,
    regular,
    COVER.contentWidth,
    MUTED,
  );

  for (const rule of layout.rules) {
    pageAt(rule.page).drawLine({
      start: { x: rule.x, y: rule.y },
      end: { x: rule.x + COVER.contentWidth, y: rule.y },
      thickness: 0.75,
      color: LINE,
    });
  }

  const columnWidth = COVER.contentWidth / COVER.columns - 10;
  details.applicants.forEach((applicant, i) => {
    const spot = layout.applicants[i];
    if (!spot) return;
    const page = pageAt(spot.page);
    write(page, applicant.name, spot.x, spot.y, COVER.nameSize, bold, columnWidth);
    applicant.details.forEach((detail, line) => {
      const y = spot.y - COVER.nameLeading - line * COVER.detailLeading + 2;
      write(page, formatContactDetail(detail), spot.x, y, COVER.detailSize, regular, columnWidth, MUTED);
    });
  });

  layout.headings.forEach((heading, i) => {
    write(
      pageAt(heading.page),
      i === 0 ? 'CONTENTS' : 'CONTENTS (CONTINUED)',
      heading.x,
      heading.y,
      COVER.headingSize,
      bold,
      COVER.contentWidth,
      MUTED,
    );
  });

  const right = COVER.marginX + COVER.contentWidth;
  const entryRows = entries.map((entry, i) => {
    const spot = layout.entries[i] as (typeof layout.entries)[number];
    const page = pageAt(spot.page);
    const number = String(i + 1).padStart(2, '0');
    const pageLabel = String(entry.pageNumber);
    const pageWidth = regular.widthOfTextAtSize(pageLabel, COVER.entrySize);
    const textX = spot.x + 26;
    const available = right - pageWidth - 16 - textX;

    page.drawText(number, { x: spot.x, y: spot.y, size: 10, font: regular, color: MUTED });
    const title = fitText(sanitize(entry.title), regular, COVER.entrySize, available);
    page.drawText(title, { x: textX, y: spot.y, size: COVER.entrySize, font: regular, color: INK });
    let textEnd = textX + regular.widthOfTextAtSize(title, COVER.entrySize);

    if (entry.description) {
      const room = right - pageWidth - 16 - (textEnd + 8);
      if (room > 40) {
        const note = fitText(`· ${sanitize(entry.description)}`, regular, COVER.noteSize, room);
        page.drawText(note, { x: textEnd + 6, y: spot.y, size: COVER.noteSize, font: regular, color: MUTED });
        textEnd += 6 + regular.widthOfTextAtSize(note, COVER.noteSize);
      }
    }

    const leaderStart = textEnd + 8;
    const leaderEnd = right - pageWidth - 6;
    if (leaderEnd - leaderStart > 8) {
      page.drawLine({
        start: { x: leaderStart, y: spot.y + 1 },
        end: { x: leaderEnd, y: spot.y + 1 },
        thickness: 0.8,
        color: LINE,
        dashArray: [0.8, 2.6],
      });
    }
    page.drawText(pageLabel, { x: right - pageWidth, y: spot.y, size: COVER.entrySize, font: regular, color: INK });
    return { page, y: spot.y };
  });

  return { pages, entryRows };
}
