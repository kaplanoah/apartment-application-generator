import { formatMonthYear, toIsoDate, type CalendarDate } from './calendar';

const MAX_NAME_PART = 80;

/**
 * The footer printed on every page, from the applicants and the address:
 * "Alex Sample & Jordan Sample · Application for 123 Main St, Apt 4B · Oct 2026".
 * Naming the people, the apartment and the month makes reuse elsewhere obvious.
 */
export function footerText(names: readonly string[], address: string, today: CalendarDate): string {
  const place = address.trim();
  return [
    joinNames(names.map((name) => name.trim()).filter(Boolean)),
    place ? `Application for ${place}` : 'Rental application',
    formatMonthYear(today),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "A", "A & B", "A, B & C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 2) return names.join(' & ');
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}

/** "Rental Application - 123 Main St Apt 4B - 2026-10-04.pdf", safe on any OS. */
export function packetFileName(address: string, today: CalendarDate): string {
  const place = address
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|#%]+/g, ' ')
    .replace(/[.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_PART)
    .trim();
  const parts = ['Rental Application', place, toIsoDate(today)].filter(Boolean);
  return `${parts.join(' - ')}.pdf`;
}
