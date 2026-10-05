import { LETTER } from './geometry';

/**
 * Where everything on the cover goes. Kept separate from drawing so the
 * number of cover pages (which shifts every page number in the contents) can
 * be known up front, and so it can be tested without rendering.
 */
export const COVER = {
  marginX: 72,
  top: LETTER.height - 72,
  /** Extra breathing room above the title on the first cover page. */
  firstPageTopGap: 40,
  bottom: 72,
  contentWidth: LETTER.width - 144,
  /** The contents list is inset on both sides so its lines stay short. */
  contentsInset: 48,
  /** The address is the largest text; without one, the title takes that size. */
  heroSize: 26,
  labelSize: 13,
  metaSize: 9,
  nameSize: 11,
  detailSize: 9.5,
  headingSize: 8,
  entrySize: 11,
  noteSize: 8.5,
  entryHeight: 20,
  columns: 3,
  nameLeading: 15,
  detailLeading: 13,
  rowGap: 12,
} as const;

/** Horizontal span of the contents list. */
export const CONTENTS_SPAN = {
  left: COVER.marginX + COVER.contentsInset,
  right: COVER.marginX + COVER.contentWidth - COVER.contentsInset,
} as const;

export interface CoverLayoutInput {
  readonly hasAddress: boolean;
  /** Number of detail lines under each applicant's name. */
  readonly applicantDetailCounts: readonly number[];
  readonly entryCount: number;
}

export interface Positioned {
  readonly page: number;
  readonly x: number;
  readonly y: number;
}

export interface SizedText extends Positioned {
  readonly size: number;
}

export interface CoverLayout {
  readonly pageCount: number;
  /** "Rental application for": a small label above the address, or the headline without one. */
  readonly title: SizedText;
  readonly address: SizedText | null;
  /** The month, right-aligned in the top-right corner: `x` is the right edge. */
  readonly date: Positioned;
  /** Baseline of each applicant's name. */
  readonly applicants: readonly Positioned[];
  readonly applicantColumnWidth: number;
  /** "Contents" heading on each cover page that lists entries. */
  readonly headings: readonly Positioned[];
  /** Baseline of each contents entry. */
  readonly entries: readonly Positioned[];
}

export function layoutCover(input: CoverLayoutInput): CoverLayout {
  const x = COVER.marginX;
  const date = { page: 0, x: x + COVER.contentWidth, y: COVER.top - COVER.metaSize };

  const titleSize = input.hasAddress ? COVER.labelSize : COVER.heroSize;
  let y = COVER.top - COVER.firstPageTopGap - titleSize;
  const title = { page: 0, x, y, size: titleSize };

  let address: SizedText | null = null;
  if (input.hasAddress) {
    y -= COVER.heroSize + 10;
    address = { page: 0, x, y, size: COVER.heroSize };
  }

  // Applicants and contents share one inset column, centered on the page.
  const columnLeft = CONTENTS_SPAN.left;
  const columnWidth = CONTENTS_SPAN.right - CONTENTS_SPAN.left;
  const count = input.applicantDetailCounts.length;
  const perRow = Math.max(1, Math.min(COVER.columns, count));
  const applicantColumnWidth = columnWidth / perRow;
  const applicants: Positioned[] = [];
  if (count > 0) {
    let rowTop = y - 52;
    for (let start = 0; start < count; start += perRow) {
      const row = input.applicantDetailCounts.slice(start, start + perRow);
      row.forEach((_, column) =>
        applicants.push({ page: 0, x: columnLeft + column * applicantColumnWidth, y: rowTop }),
      );
      const tallest = Math.max(...row.map((lines) => COVER.nameLeading + lines * COVER.detailLeading));
      rowTop -= tallest + COVER.rowGap;
    }
    y = rowTop + COVER.rowGap;
  }

  const headings: Positioned[] = [];
  const entries: Positioned[] = [];
  let page = 0;
  y -= count > 0 ? 34 : 52;
  headings.push({ page, x: columnLeft, y });
  y -= 26;
  for (let i = 0; i < input.entryCount; i++) {
    if (y < COVER.bottom) {
      page += 1;
      y = COVER.top - COVER.headingSize;
      headings.push({ page, x: columnLeft, y });
      y -= 26;
    }
    entries.push({ page, x: columnLeft, y });
    y -= COVER.entryHeight;
  }

  return { pageCount: page + 1, title, address, date, applicants, applicantColumnWidth, headings, entries };
}
