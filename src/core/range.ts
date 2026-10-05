import { addMonths, endOfLastFullMonth, type CalendarDate } from './calendar';
import type { FolderOption } from './library';

/** Which files of a folder go into the packet. */
export type Range =
  | { readonly kind: 'all' }
  | { readonly kind: 'months'; readonly count: number; readonly through: MonthsAnchor }
  | { readonly kind: 'documents'; readonly count: number };

/** Count months back from the end of the last full month, or from today. */
export type MonthsAnchor = 'last-full-month' | 'today';

export const MIN_COUNT = 1;
export const MAX_COUNT = 24;
export const DEFAULT_COUNT = 2;

export interface DateWindow {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
}

/**
 * The span covered by "last N months":
 * - through the last full month: N whole calendar months ending with it
 *   (on Oct 4, "last 2 months" is Aug 1 – Sep 30);
 * - through today: the N months up to and including today (Aug 4 – Oct 4).
 */
export function monthsWindow(count: number, through: MonthsAnchor, today: CalendarDate): DateWindow {
  if (through === 'today') {
    return { start: addMonths(today, -count), end: today };
  }
  const end = endOfLastFullMonth(today);
  const start = { ...addMonths({ year: end.year, month: end.month, day: 1 }, -(count - 1)), day: 1 };
  return { start, end };
}

/**
 * Sensible starting range for a folder: everything when nothing is dated,
 * "last 2 months" for monthly or dated files, "last 2 documents" for files
 * dated only by year (W-2s, tax returns).
 */
export function defaultRange<F>(option: FolderOption<F>): Range {
  if (!option.hasDates) return { kind: 'all' };
  const hasFineDates = option.documents.some((doc) => doc.date && doc.date.precision !== 'year');
  return hasFineDates
    ? { kind: 'months', count: DEFAULT_COUNT, through: 'last-full-month' }
    : { kind: 'documents', count: DEFAULT_COUNT };
}

export function clampCount(count: number): number {
  if (!Number.isFinite(count)) return DEFAULT_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(count)));
}

/** Short text for the contents page: "last 2 months" or "last 2". */
export function describeRange(range: Range): string | null {
  switch (range.kind) {
    case 'all':
      return null;
    case 'months':
      return `last ${range.count} ${range.count === 1 ? 'month' : 'months'}`;
    case 'documents':
      return `last ${range.count}`;
  }
}
