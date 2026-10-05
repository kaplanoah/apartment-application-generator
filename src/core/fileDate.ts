import { daysInMonth, isValidDate, type CalendarDate } from './calendar';

export type DatePrecision = 'year' | 'month' | 'day';

/** The span of time a file covers, based on the date in its name. */
export interface FileDate {
  readonly precision: DatePrecision;
  readonly start: CalendarDate;
  readonly end: CalendarDate;
}

const MIN_YEAR = 1900;
const MAX_YEAR = 2099;

/*
 * A 4-digit year, optionally followed by a month and day using one consistent
 * separator ("2026-09-18", "2026_9_18", "2026.09"), or the compact "20260918".
 * The year must not touch other digits, and must not be the tail of a
 * US-style date like "09-10-2026", which is ambiguous and therefore ignored.
 */
const DATE_PATTERN =
  /(?<!\d)(?<!(?:^|\D)\d{1,2}[-_.]\d{1,2}[-_.])(\d{4})(?:([-_.])(\d{1,2})(?:\2(\d{1,2}))?|(\d{2})(\d{2}))?(?!\d)/g;

/**
 * Finds the first valid date in a file name. Returns null when there is none,
 * so the file counts as undated.
 *
 *   "alex_2025.pdf"          → all of 2025
 *   "chase 2026-09.pdf"      → all of September 2026
 *   "2026-09-18.pdf"         → September 18, 2026
 *   "jordan_2025_1040.pdf"     → all of 2025 (1040 is not a plausible year)
 */
export function parseFileDate(fileName: string): FileDate | null {
  const base = fileName.replace(/\.[^.]*$/, '');
  for (const match of base.matchAll(DATE_PATTERN)) {
    const year = Number(match[1]);
    if (year < MIN_YEAR || year > MAX_YEAR) continue;

    const month = match[3] ?? match[5];
    const day = match[4] ?? match[6];
    const date = toFileDate(year, month, day);
    if (date) return date;
  }
  return null;
}

function toFileDate(year: number, month?: string, day?: string): FileDate | null {
  if (month === undefined) {
    return { precision: 'year', start: { year, month: 1, day: 1 }, end: { year, month: 12, day: 31 } };
  }
  const m = Number(month);
  if (day === undefined) {
    if (m < 1 || m > 12) return null;
    return {
      precision: 'month',
      start: { year, month: m, day: 1 },
      end: { year, month: m, day: daysInMonth(year, m) },
    };
  }
  const d = Number(day);
  if (!isValidDate(year, m, d)) return null;
  const date = { year, month: m, day: d };
  return { precision: 'day', start: date, end: date };
}
