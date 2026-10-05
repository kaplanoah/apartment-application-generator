import type { CalendarDate } from './calendar';
import type { Library, LibraryDocument, LibraryOption } from './library';
import { defaultRange, describeRange, type Range } from './range';
import { selectDocuments } from './selection';

/** One row of the packet: which option, and (for folders) which range. */
export interface PacketItem {
  readonly optionId: string;
  readonly range: Range;
}

export interface PlannedSection<F> {
  readonly title: string;
  /** Range in words for the contents page, or null when everything is included. */
  readonly description: string | null;
  readonly documents: readonly LibraryDocument<F>[];
}

export function newPacketItem<F>(option: LibraryOption<F>): PacketItem {
  return { optionId: option.id, range: option.kind === 'folder' ? defaultRange(option) : { kind: 'all' } };
}

export function findOption<F>(library: Library<F>, optionId: string): LibraryOption<F> | undefined {
  return library.options.find((option) => option.id === optionId);
}

function documentsFor<F>(option: LibraryOption<F>, range: Range, today: CalendarDate): readonly LibraryDocument<F>[] {
  return option.kind === 'file' ? [option.document] : selectDocuments(option, range, today).included;
}

/** Resolves the arranged items into sections, dropping any that come out empty. */
export function planPacket<F>(
  library: Library<F>,
  items: readonly PacketItem[],
  today: CalendarDate,
): PlannedSection<F>[] {
  const sections: PlannedSection<F>[] = [];
  for (const item of items) {
    const option = findOption(library, item.optionId);
    if (!option) continue;
    const documents = documentsFor(option, item.range, today);
    if (documents.length === 0) continue;
    sections.push({
      title: option.title,
      description: option.kind === 'folder' ? describeRange(item.range) : null,
      documents,
    });
  }
  return sections;
}

/** Moves an item to a new position; indexes refer to the list before the move. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  const target = from < to ? to - 1 : to;
  next.splice(Math.max(0, Math.min(next.length, target)), 0, moved);
  return next;
}
