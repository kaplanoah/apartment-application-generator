import { describe, expect, it } from 'vitest';
import { CONTENTS_SPAN, COVER, layoutCover } from '../../src/pdf/coverLayout';

describe('layoutCover', () => {
  it('fits a typical packet on one page, flowing top to bottom', () => {
    const layout = layoutCover({ hasAddress: true, applicantDetailCounts: [2, 2], entryCount: 8 });
    expect(layout.pageCount).toBe(1);
    const ys = [
      layout.title.y,
      layout.address?.y ?? 0,
      layout.applicants[0]?.y ?? 0,
      layout.headings[0]?.y ?? 0,
      layout.entries[0]?.y ?? 0,
    ];
    expect(ys).toEqual([...ys].sort((a, b) => b - a));
    expect(layout.entries.every((e) => e.y >= COVER.bottom)).toBe(true);
  });

  it('makes the address the largest text, with the title as a small label above it', () => {
    const withAddress = layoutCover({ hasAddress: true, applicantDetailCounts: [], entryCount: 1 });
    expect(withAddress.address?.size).toBeGreaterThan(withAddress.title.size);
    const without = layoutCover({ hasAddress: false, applicantDetailCounts: [], entryCount: 1 });
    expect(without.address).toBeNull();
    expect(without.title.size).toBe(withAddress.address?.size);
  });

  it('puts the month in the top-right corner, above everything else', () => {
    const layout = layoutCover({ hasAddress: true, applicantDetailCounts: [1], entryCount: 1 });
    expect(layout.date.x).toBe(COVER.marginX + COVER.contentWidth);
    expect(layout.date.y).toBeGreaterThan(layout.title.y);
  });

  it('lines applicants up with the inset contents, in up to three columns', () => {
    const two = layoutCover({ hasAddress: true, applicantDetailCounts: [2, 2], entryCount: 1 });
    const width = CONTENTS_SPAN.right - CONTENTS_SPAN.left;
    expect(two.applicants.map((a) => a.x)).toEqual([CONTENTS_SPAN.left, CONTENTS_SPAN.left + width / 2]);
    expect(two.headings[0]?.x).toBe(CONTENTS_SPAN.left);
    expect(two.entries[0]?.x).toBe(CONTENTS_SPAN.left);

    const four = layoutCover({ hasAddress: false, applicantDetailCounts: [1, 1, 1, 3], entryCount: 1 });
    expect(four.applicants.map((a) => a.x)).toEqual([
      CONTENTS_SPAN.left,
      CONTENTS_SPAN.left + width / 3,
      CONTENTS_SPAN.left + (2 * width) / 3,
      CONTENTS_SPAN.left,
    ]);
    expect(four.applicants[3]?.y).toBeLessThan(four.applicants[0]?.y ?? 0);
  });

  it('continues the contents on more pages when needed', () => {
    const layout = layoutCover({ hasAddress: true, applicantDetailCounts: [2], entryCount: 60 });
    expect(layout.pageCount).toBeGreaterThan(1);
    expect(layout.headings).toHaveLength(layout.pageCount);
    expect(layout.entries.every((e) => e.y >= COVER.bottom - COVER.entryHeight)).toBe(true);
    expect(layout.entries.at(-1)?.page).toBe(layout.pageCount - 1);
  });
});
