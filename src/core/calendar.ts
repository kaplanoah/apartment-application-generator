/**
 * Timezone-free calendar dates. Everything date-related in the app goes
 * through these helpers so "today", month math and comparisons never shift
 * with the viewer's timezone or daylight saving.
 */
export interface CalendarDate {
  readonly year: number;
  /** 1 = January … 12 = December. */
  readonly month: number;
  readonly day: number;
}

const MS_PER_DAY = 86_400_000;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidDate(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

/** Days since 1970-01-01; handy for comparing and ordering dates. */
export function toDayNumber(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day) / MS_PER_DAY;
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** Moves by whole months, clamping the day (Mar 31 − 1 month = Feb 28/29). */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

function startOfMonth(date: CalendarDate): CalendarDate {
  return { year: date.year, month: date.month, day: 1 };
}

function endOfMonth(date: CalendarDate): CalendarDate {
  return { year: date.year, month: date.month, day: daysInMonth(date.year, date.month) };
}

/** The last day of the most recent month that has fully ended. */
export function endOfLastFullMonth(today: CalendarDate): CalendarDate {
  return endOfMonth(addMonths(startOfMonth(today), -1));
}

/** Reads the local calendar date from a JS Date (the viewer's "today"). */
export function fromLocalDate(date: Date): CalendarDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/** "Sep 30, 2026" */
export function formatDate(date: CalendarDate): string {
  return `${MONTH_NAMES[date.month - 1]} ${date.day}, ${date.year}`;
}

/** "Sep 30" */
export function formatMonthDay(date: CalendarDate): string {
  return `${MONTH_NAMES[date.month - 1]} ${date.day}`;
}

/** "Oct 2026" */
export function formatMonthYear(date: CalendarDate): string {
  return `${MONTH_NAMES[date.month - 1]} ${date.year}`;
}

/** "Aug 1 – Sep 30, 2026", or both years when the range crosses one. */
export function formatRange(start: CalendarDate, end: CalendarDate): string {
  return start.year === end.year
    ? `${formatMonthDay(start)} – ${formatDate(end)}`
    : `${formatDate(start)} – ${formatDate(end)}`;
}

/** "October 2026" */
export function formatLongMonthYear(date: CalendarDate): string {
  return new Date(Date.UTC(date.year, date.month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "2026-10-04" */
export function toIsoDate(date: CalendarDate): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}
