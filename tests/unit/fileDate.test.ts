import { describe, expect, it } from 'vitest';
import { parseFileDate } from '../../src/core/fileDate';

const span = (name: string) => {
  const date = parseFileDate(name);
  if (!date) return null;
  const iso = ({ year, month, day }: { year: number; month: number; day: number }) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return `${date.precision} ${iso(date.start)}..${iso(date.end)}`;
};

describe('parseFileDate', () => {
  it.each([
    ['2026-09-18.pdf', 'day 2026-09-18..2026-09-18'],
    ['alex_2026-09-18.pdf', 'day 2026-09-18..2026-09-18'],
    ['2026_09_18 stub.pdf', 'day 2026-09-18..2026-09-18'],
    ['2026.9.8.pdf', 'day 2026-09-08..2026-09-08'],
    ['20260918.pdf', 'day 2026-09-18..2026-09-18'],
    ['Screenshot 2026-09-15 at 10.30.12 AM.png', 'day 2026-09-15..2026-09-15'],
    ['chase_2026-09.pdf', 'month 2026-09-01..2026-09-30'],
    ['coned 2026-02.pdf', 'month 2026-02-01..2026-02-28'],
    ['2028-02.pdf', 'month 2028-02-01..2028-02-29'],
    ['alex_2025.pdf', 'year 2025-01-01..2025-12-31'],
    ['w2 2024 final.pdf', 'year 2024-01-01..2024-12-31'],
    ['jordan_2025_1040.pdf', 'year 2025-01-01..2025-12-31'],
    ['1040_2025.pdf', 'year 2025-01-01..2025-12-31'],
  ])('reads %s', (name, expected) => {
    expect(span(name)).toBe(expected);
  });

  it.each([
    ['passport.pdf'],
    ['offer-letter.pdf'],
    ['1040.pdf'], // not a plausible year
    ['scan 0042.pdf'],
    ['09-10-2026.pdf'], // US style: ambiguous, so treated as undated
    ['9.10.2026 bill.pdf'],
    ['2026-13-01.pdf'], // no 13th month
    ['2026-02-30.pdf'], // no Feb 30
    ['12345.pdf'],
  ])('treats %s as undated', (name) => {
    expect(parseFileDate(name)).toBeNull();
  });

  it('falls back to the month when the day runs into more digits', () => {
    expect(span('2026-09-181.pdf')).toBe('month 2026-09-01..2026-09-30');
  });

  it('requires one consistent separator', () => {
    expect(span('2026-09_18.pdf')).toBe('month 2026-09-01..2026-09-30');
  });

  it('ignores the extension', () => {
    expect(span('report.2026')).toBeNull();
    expect(span('report 2026.pdf')).toBe('year 2026-01-01..2026-12-31');
  });
});
