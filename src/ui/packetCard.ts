import type { CalendarDate } from '../core/calendar';
import type { LibraryDocument, LibraryOption } from '../core/library';
import type { PacketItem } from '../core/packet';
import type { Range } from '../core/range';
import { selectDocuments } from '../core/selection';
import { h } from './dom';
import { rangeControl } from './rangeControl';

export interface CardHandlers {
  readonly onRangeChange: (range: Range) => void;
  readonly onRemove: () => void;
}

const SKIP_TEXT = {
  'different-level': 'different folder level',
  'unsupported-type': 'file type not supported',
} as const;

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
      ...option.skipped.map((skip) => `${skip.path} (${SKIP_TEXT[skip.reason]})`),
      ...selection.undated.map((doc) => `${doc.path} (no date in the name)`),
    ];
    control = rangeControl(option, item.range, today, handlers.onRangeChange, focusKey);
  }

  const count = option.kind === 'file' ? 'File' : `${included.length} ${included.length === 1 ? 'file' : 'files'}`;
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
        'aria-label': `${index + 1}. ${option.title}. Alt plus arrow keys to move, Delete to remove.`,
      },
      h(
        'div',
        { class: 'card-top' },
        h('span', { class: 'card-title' }, option.title),
        h('span', {
          class: `icon ${option.kind}`,
          title: option.kind === 'folder' ? 'Folder' : 'File',
          'aria-hidden': 'true',
        }),
        h('span', { class: 'spacer' }),
        h('span', { class: 'count' }, count),
        h(
          'button',
          { type: 'button', class: 'remove', 'aria-label': `Remove ${option.title}`, onclick: handlers.onRemove },
          '×',
        ),
      ),
      control,
      option.kind === 'folder' &&
        (included.length > 0
          ? h('p', { class: 'paths' }, ...included.flatMap((doc, i) => [i > 0 ? ' · ' : '', pathNode(doc)]))
          : h('p', { class: 'paths empty' }, 'No files in this range')),
      option.kind === 'file' && h('p', { class: 'paths' }, option.document.name),
      notIncluded.length > 0 && h('p', { class: 'paths skipped' }, `Not included: ${notIncluded.join(', ')}`),
    ),
  );
}

function pathNode(doc: LibraryDocument<unknown>): HTMLElement {
  return h('span', null, doc.subfolder && h('span', { class: 'sub' }, `${doc.subfolder}/`), doc.name);
}
