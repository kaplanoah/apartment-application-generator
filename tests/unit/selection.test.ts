import { describe, expect, it } from 'vitest';
import { defaultRange, describeRange, monthsWindow, clampCount } from '../../src/core/range';
import { selectDocuments } from '../../src/core/selection';
import { folderOf, TODAY } from '../support/library';

const STUBS = folderOf([
  'Pay Stubs/Noah/2026-10-02.pdf',
  'Pay Stubs/Noah/2026-09-18.pdf',
  'Pay Stubs/Noah/2026-09-04.pdf',
  'Pay Stubs/Noah/2026-08-21.pdf',
  'Pay Stubs/Noah/2026-08-07.pdf',
  'Pay Stubs/Noah/2026-07-24.pdf',
  'Pay Stubs/Anna/2026-09-30.pdf',
  'Pay Stubs/Anna/2026-08-31.pdf',
  'Pay Stubs/Anna/2026-07-31.pdf',
  'Pay Stubs/Anna/notes.pdf',
]);
const names = (docs: readonly { path: string }[]) => docs.map((d) => d.path);

describe('monthsWindow', () => {
  it('counts whole months back from the last full month by default', () => {
    expect(monthsWindow(2, 'last-full-month', TODAY)).toEqual({
      start: { year: 2026, month: 8, day: 1 },
      end: { year: 2026, month: 9, day: 30 },
    });
    expect(monthsWindow(3, 'last-full-month', { year: 2026, month: 2, day: 10 })).toEqual({
      start: { year: 2025, month: 11, day: 1 },
      end: { year: 2026, month: 1, day: 31 },
    });
  });

  it('can count back from today instead', () => {
    expect(monthsWindow(2, 'today', TODAY)).toEqual({ start: { year: 2026, month: 8, day: 4 }, end: TODAY });
  });
});

describe('selectDocuments', () => {
  it('months: includes files whose date falls in the window', () => {
    const { included, undated } = selectDocuments(
      STUBS,
      { kind: 'months', count: 2, through: 'last-full-month' },
      TODAY,
    );
    expect(names(included)).toEqual([
      'Anna/2026-09-30.pdf',
      'Anna/2026-08-31.pdf',
      'Noah/2026-09-18.pdf',
      'Noah/2026-09-04.pdf',
      'Noah/2026-08-21.pdf',
      'Noah/2026-08-07.pdf',
    ]);
    expect(names(undated)).toEqual(['Anna/notes.pdf']);
  });

  it('months through today picks up this month too', () => {
    const { included } = selectDocuments(STUBS, { kind: 'months', count: 2, through: 'today' }, TODAY);
    expect(names(included)).toContain('Noah/2026-10-02.pdf');
    expect(names(included)).toContain('Noah/2026-08-07.pdf'); // after Aug 4
    expect(names(included)).not.toContain('Anna/2026-07-31.pdf'); // before Aug 4
  });

  it('months: a monthly or yearly file counts when any part of it overlaps', () => {
    // 1 month through today = Sep 4 – Oct 4
    const folder = folderOf(['Bills/2026-08.pdf', 'Bills/2026-09.pdf', 'Bills/2026.pdf', 'Bills/2025.pdf']);
    const { included } = selectDocuments(folder, { kind: 'months', count: 1, through: 'today' }, TODAY);
    expect(names(included)).toEqual(['2026-09.pdf', '2026.pdf']);
  });

  it('documents: the newest N of each subfolder', () => {
    const { included, undated } = selectDocuments(STUBS, { kind: 'documents', count: 2 }, TODAY);
    expect(names(included)).toEqual([
      'Anna/2026-09-30.pdf',
      'Anna/2026-08-31.pdf',
      'Noah/2026-10-02.pdf',
      'Noah/2026-09-18.pdf',
    ]);
    expect(names(undated)).toEqual(['Anna/notes.pdf']);
  });

  it('documents: the newest N of a flat folder', () => {
    const w2s = folderOf(['W-2s/noah_2025.pdf', 'W-2s/noah_2024.pdf', 'W-2s/noah_2023.pdf']);
    expect(names(selectDocuments(w2s, { kind: 'documents', count: 2 }, TODAY).included)).toEqual([
      'noah_2025.pdf',
      'noah_2024.pdf',
    ]);
  });

  it('all: everything, dated or not', () => {
    const { included, undated } = selectDocuments(STUBS, { kind: 'all' }, TODAY);
    expect(included).toHaveLength(10);
    expect(undated).toEqual([]);
  });
});

describe('defaultRange and describeRange', () => {
  it('picks a sensible default', () => {
    expect(defaultRange(STUBS)).toEqual({ kind: 'months', count: 2, through: 'last-full-month' });
    expect(defaultRange(folderOf(['W/a_2025.pdf', 'W/a_2024.pdf']))).toEqual({ kind: 'documents', count: 2 });
    expect(defaultRange(folderOf(['ID/license.jpg']))).toEqual({ kind: 'all' });
  });

  it('describes ranges for the contents page', () => {
    expect(describeRange({ kind: 'months', count: 2, through: 'last-full-month' }, STUBS, TODAY)).toBe(
      'Aug 1 – Sep 30, 2026',
    );
    expect(describeRange({ kind: 'documents', count: 2 }, STUBS, TODAY)).toBe('last 2 each');
    expect(describeRange({ kind: 'documents', count: 1 }, folderOf(['W/a_2025.pdf']), TODAY)).toBe('last 1');
    expect(describeRange({ kind: 'all' }, STUBS, TODAY)).toBeNull();
  });

  it('clamps counts', () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(99)).toBe(24);
    expect(clampCount(2.6)).toBe(3);
    expect(clampCount(Number.NaN)).toBe(2);
  });
});
