import type { CalendarDate } from '../core/calendar';
import type { LibraryDocument, LibraryOption, SkippedFile } from '../core/library';
import type { PacketItem } from '../core/packet';
import type { Range } from '../core/range';
import { selectDocuments } from '../core/selection';
import { h } from './dom';
import { optionIcon } from './icons';
import { rangeControl } from './rangeControl';

export interface CardHandlers {
  readonly onRangeChange: (range: Range) => void;
}

function skipText(skip: SkippedFile): string {
  switch (skip.reason) {
    case 'different-level':
      return 'different folder level';
    case 'unsupported-type':
      return 'file type not supported';
    case 'needs-pdf':
      return `save it as a PDF first: ${skip.exportSteps ?? 'export it as PDF'}`;
  }
}

/** One packet row: order number in the gutter, then the card. */
export function packetCard(
  option: LibraryOption<unknown>,
  item: PacketItem,
  index: number,
  today: CalendarDate,
  handlers: CardHandlers,
): HTMLElement {
  const focusKey = `card:${option.id}`;
  let included: readonly LibraryDocument<unknown>[];
  let notIncluded: string[] = [];
  let control: HTMLElement | null = null;

  if (option.kind === 'file') {
    included = [option.document];
  } else {
    const selection = selectDocuments(option, item.range, today);
    included = selection.included;
    notIncluded = [
      ...option.skipped.map((skip) => `${skip.path} (${skipText(skip)})`),
      ...selection.undated.map((doc) => `${doc.path} (no date in the name)`),
    ];
    control = rangeControl(option, item.range, today, handlers.onRangeChange, focusKey);
  }

  const count =
    included.length === 0 ? 'No files in this range' : `${included.length} ${included.length === 1 ? 'file' : 'files'}`;
  return h(
    'li',
    { class: 'row', 'data-option-id': option.id },
    h('span', { class: 'gutter', 'aria-hidden': 'true' }, String(index + 1)),
    h(
      'div',
      {
        class: 'card',
        draggable: 'true',
        tabindex: 0,
        'data-focus-key': focusKey,
        'aria-label': `${index + 1}. ${option.title}. Drag back up to remove, or use Alt plus arrow keys to move and Delete to remove.`,
      },
      h('div', { class: 'card-top' }, h('span', { class: 'card-title' }, option.title), optionIcon(option)),
      control,
      option.kind === 'folder' &&
        h(
          'div',
          { class: 'files' },
          h('span', { class: included.length > 0 ? 'count' : 'count empty' }, count),
          included.length > 0 &&
            h('p', { class: 'paths' }, ...included.flatMap((doc, i) => [i > 0 ? ' · ' : '', pathNode(doc)])),
        ),
      option.kind === 'file' && h('p', { class: 'paths' }, option.document.name),
      notIncluded.length > 0 && h('p', { class: 'paths skipped' }, `Not included: ${notIncluded.join(', ')}`),
    ),
  );
}

function pathNode(doc: LibraryDocument<unknown>): HTMLElement {
  return h('span', null, doc.subfolder && h('span', { class: 'sub' }, `${doc.subfolder}/`), doc.name);
}
