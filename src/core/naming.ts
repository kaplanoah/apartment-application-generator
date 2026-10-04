import { formatMonthYear, toIsoDate, type CalendarDate } from './calendar';

const MAX_NAME_PART = 80;

/** Footer suggested from the address: "For 123 Main St #4B application only · Oct 2026". */
export function suggestedFooter(address: string, today: CalendarDate): string {
  const place = address.trim();
  return place ? `For ${place} application only · ${formatMonthYear(today)}` : '';
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
