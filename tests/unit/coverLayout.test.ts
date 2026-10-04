import { describe, expect, it } from 'vitest';
import { COVER, layoutCover } from '../../src/pdf/coverLayout';

describe('layoutCover', () => {
  it('fits a typical packet on one page, top to bottom', () => {
    const layout = layoutCover({ hasAddress: true, applicantDetailCounts: [2, 2], entryCount: 8 });
    expect(layout.pageCount).toBe(1);
    const ys = [
      layout.title.y,
      layout.address?.y ?? 0,
      layout.prepared.y,
      ...layout.applicants.map((a) => a.y),
      ...layout.entries.map((e) => e.y),
    ];
    // Everything flows downward and stays above the bottom margin.
    expect(layout.applicants[0]?.y).toBe(layout.applicants[1]?.y);
    expect(layout.entries.every((e) => e.y >= COVER.bottom)).toBe(true);
    expect(ys.slice(0, 3)).toEqual([...ys.slice(0, 3)].sort((a, b) => b - a));
  });

  it('wraps applicants into rows of three', () => {
    const layout = layoutCover({ hasAddress: false, applicantDetailCounts: [1, 1, 1, 3], entryCount: 1 });
    expect(layout.address).toBeNull();
    expect(layout.applicants.map((a) => a.x)).toEqual([72, 228, 384, 72]);
    expect(layout.applicants[3]?.y).toBeLessThan(layout.applicants[0]?.y ?? 0);
  });

  it('continues the contents on more pages when needed', () => {
    const layout = layoutCover({ hasAddress: true, applicantDetailCounts: [2], entryCount: 60 });
    expect(layout.pageCount).toBeGreaterThan(1);
    expect(layout.headings).toHaveLength(layout.pageCount);
    expect(layout.entries.every((e) => e.y >= COVER.bottom - COVER.entryHeight)).toBe(true);
    expect(layout.entries.at(-1)?.page).toBe(layout.pageCount - 1);
  });

  it('handles an empty packet and no applicants', () => {
    const layout = layoutCover({ hasAddress: false, applicantDetailCounts: [], entryCount: 0 });
    expect(layout.pageCount).toBe(1);
    expect(layout.rules).toHaveLength(1);
  });
});
