import { toDayNumber, type CalendarDate } from './calendar';
import type { FolderOption, LibraryDocument } from './library';
import { monthsWindow, type Range } from './range';

export interface Selection<F> {
  readonly included: readonly LibraryDocument<F>[];
  /** Files left out because the range needs a date and they have none. */
  readonly undated: readonly LibraryDocument<F>[];
}

/**
 * Picks the files of a folder that match a range. Order is preserved from the
 * library (by subfolder, newest first).
 *
 * - all:        every file
 * - months:     dated files whose date overlaps the window
 * - documents:  the newest N dated files of each subfolder
 */
export function selectDocuments<F>(option: FolderOption<F>, range: Range, today: CalendarDate): Selection<F> {
  if (range.kind === 'all') return { included: option.documents, undated: [] };

  const dated = option.documents.filter((doc) => doc.date !== null);
  const undated = option.documents.filter((doc) => doc.date === null);

  if (range.kind === 'months') {
    const window = monthsWindow(range.count, range.through, today);
    const start = toDayNumber(window.start);
    const end = toDayNumber(window.end);
    const included = dated.filter(
      (doc) => doc.date && toDayNumber(doc.date.end) >= start && toDayNumber(doc.date.start) <= end,
    );
    return { included, undated };
  }

  const taken = new Map<string, number>();
  const included = dated.filter((doc) => {
    const count = taken.get(doc.subfolder) ?? 0;
    taken.set(doc.subfolder, count + 1);
    return count < range.count;
  });
  return { included, undated };
}
