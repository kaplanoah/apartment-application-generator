import { LETTER } from './geometry';

/**
 * Where everything on the cover goes. Kept separate from drawing so the
 * number of cover pages (which shifts every page number in the contents) can
 * be known up front, and so it can be tested without rendering.
 */
export const COVER = {
  marginX: 72,
  top: LETTER.height - 72,
  bottom: 72,
  contentWidth: LETTER.width - 144,
  titleSize: 26,
  addressSize: 13,
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

export interface CoverLayout {
  readonly pageCount: number;
  readonly title: Positioned;
  readonly address: Positioned | null;
  readonly prepared: Positioned;
  readonly rules: readonly Positioned[];
  /** Baseline of each applicant's name. */
  readonly applicants: readonly Positioned[];
  /** "Contents" heading on each cover page that lists entries. */
  readonly headings: readonly Positioned[];
  /** Baseline of each contents entry. */
  readonly entries: readonly Positioned[];
}

export function layoutCover(input: CoverLayoutInput): CoverLayout {
  const x = COVER.marginX;
  let y = COVER.top - COVER.titleSize;
  const title = { page: 0, x, y };

  let address: Positioned | null = null;
  if (input.hasAddress) {
    y -= 22;
    address = { page: 0, x, y };
  }
  y -= 18;
  const prepared = { page: 0, x, y };

  y -= 18;
  const rules: Positioned[] = [{ page: 0, x, y }];

  const applicants: Positioned[] = [];
  if (input.applicantDetailCounts.length > 0) {
    const columnWidth = COVER.contentWidth / COVER.columns;
    let rowTop = y - 24;
    for (let start = 0; start < input.applicantDetailCounts.length; start += COVER.columns) {
      const row = input.applicantDetailCounts.slice(start, start + COVER.columns);
      row.forEach((_, column) => applicants.push({ page: 0, x: x + column * columnWidth, y: rowTop }));
      const tallest = Math.max(...row.map((lines) => COVER.nameLeading + lines * COVER.detailLeading));
      rowTop -= tallest + COVER.rowGap;
    }
    y = rowTop + COVER.rowGap - 6;
    rules.push({ page: 0, x, y });
  }

  const headings: Positioned[] = [];
  const entries: Positioned[] = [];
  let page = 0;
  y -= 30;
  headings.push({ page, x, y });
  y -= 26;
  for (let i = 0; i < input.entryCount; i++) {
    if (y < COVER.bottom) {
      page += 1;
      y = COVER.top - COVER.headingSize;
      headings.push({ page, x, y });
      y -= 26;
    }
    entries.push({ page, x, y });
    y -= COVER.entryHeight;
  }

  return { pageCount: page + 1, title, address, prepared, rules, applicants, headings, entries };
}
