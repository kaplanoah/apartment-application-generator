import { describe, expect, it } from 'vitest';
import {
  addMonths,
  compareDates,
  daysInMonth,
  endOfLastFullMonth,
  formatDate,
  formatMonthYear,
  formatRange,
  fromLocalDate,
  isValidDate,
  toIsoDate,
} from '../../src/core/calendar';

const d = (year: number, month: number, day: number) => ({ year, month, day });

describe('calendar', () => {
  it('knows month lengths, including leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('validates dates', () => {
    expect(isValidDate(2026, 9, 30)).toBe(true);
    expect(isValidDate(2026, 9, 31)).toBe(false);
    expect(isValidDate(2026, 13, 1)).toBe(false);
    expect(isValidDate(2026, 0, 1)).toBe(false);
    expect(isValidDate(2026, 1.5, 1)).toBe(false);
  });

  it('adds months and clamps to the end of shorter months', () => {
    expect(addMonths(d(2026, 10, 4), -2)).toEqual(d(2026, 8, 4));
    expect(addMonths(d(2026, 3, 31), -1)).toEqual(d(2026, 2, 28));
    expect(addMonths(d(2026, 1, 15), -1)).toEqual(d(2025, 12, 15));
    expect(addMonths(d(2026, 11, 30), 3)).toEqual(d(2027, 2, 28));
    expect(addMonths(d(2026, 5, 5), -24)).toEqual(d(2024, 5, 5));
  });

  it('finds the end of the last full month', () => {
    expect(endOfLastFullMonth(d(2026, 10, 4))).toEqual(d(2026, 9, 30));
    expect(endOfLastFullMonth(d(2026, 1, 31))).toEqual(d(2025, 12, 31));
    expect(endOfLastFullMonth(d(2028, 3, 1))).toEqual(d(2028, 2, 29));
  });

  it('compares dates', () => {
    expect(compareDates(d(2026, 1, 1), d(2025, 12, 31))).toBeGreaterThan(0);
    expect(compareDates(d(2026, 1, 1), d(2026, 1, 1))).toBe(0);
  });

  it('reads the local date from a JS Date', () => {
    expect(fromLocalDate(new Date(2026, 9, 4, 23, 59))).toEqual(d(2026, 10, 4));
  });

  it('formats dates for people', () => {
    expect(formatDate(d(2026, 9, 30))).toBe('Sep 30, 2026');
    expect(formatMonthYear(d(2026, 10, 4))).toBe('Oct 2026');
    expect(formatRange(d(2026, 8, 1), d(2026, 9, 30))).toBe('Aug 1 – Sep 30, 2026');
    expect(formatRange(d(2025, 11, 1), d(2026, 1, 31))).toBe('Nov 1, 2025 – Jan 31, 2026');
    expect(toIsoDate(d(2026, 1, 5))).toBe('2026-01-05');
  });
});
