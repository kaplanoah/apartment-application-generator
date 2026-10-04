import { endOfLastFullMonth, formatMonthDay, type CalendarDate } from '../core/calendar';
import type { FolderOption } from '../core/library';
import { clampCount, MAX_COUNT, MIN_COUNT, type Range } from '../core/range';
import { h } from './dom';

type Unit = Range['kind'];

/** Reads as a phrase: Last [2] [months] [through Sep 30]. */
export function rangeControl(
  option: FolderOption<unknown>,
  range: Range,
  today: CalendarDate,
  onChange: (range: Range) => void,
  focusKey: string,
): HTMLElement {
  if (!option.hasDates) return h('span', { class: 'range-all' }, 'All files');

  const count = range.kind === 'all' ? 2 : range.count;
  const through = range.kind === 'months' ? range.through : 'last-full-month';
  const build = (unit: Unit, n: number, anchor: typeof through): Range =>
    unit === 'all'
      ? { kind: 'all' }
      : unit === 'months'
        ? { kind: 'months', count: n, through: anchor }
        : { kind: 'documents', count: n };

  const unitSelect = select(
    `${option.title}: what to include`,
    [
      ['months', range.kind === 'all' ? 'by months' : 'months'],
      ['documents', range.kind === 'all' ? 'by documents' : 'documents'],
      ['all', 'All files'],
    ],
    range.kind,
    (value) => onChange(build(value as Unit, count, through)),
    `${focusKey}:unit`,
  );
  if (range.kind === 'all') return h('span', { class: 'range' }, unitSelect);

  const numbers: [string, string][] = [];
  for (let n = MIN_COUNT; n <= MAX_COUNT; n++) numbers.push([String(n), String(n)]);
  const countSelect = select(
    `${option.title}: how many`,
    numbers,
    String(range.count),
    (value) => onChange(build(range.kind, clampCount(Number(value)), through)),
    `${focusKey}:count`,
  );

  const anchor =
    range.kind === 'months'
      ? select(
          `${option.title}: count back from`,
          [
            ['last-full-month', `through ${formatMonthDay(endOfLastFullMonth(today))}`],
            ['today', 'through today'],
          ],
          range.through,
          (value) => onChange(build('months', range.count, value as typeof through)),
          `${focusKey}:anchor`,
          'anchor',
        )
      : null;

  return h('span', { class: 'range' }, h('span', { class: 'range-main' }, 'Last', countSelect, unitSelect), anchor);
}

function select(
  label: string,
  options: readonly (readonly [string, string])[],
  value: string,
  onChange: (value: string) => void,
  focusKey: string,
  className = '',
): HTMLSelectElement {
  const element = h('select', { 'aria-label': label, class: className, 'data-focus-key': focusKey });
  for (const [optionValue, text] of options) {
    const option = h('option', { value: optionValue }, text);
    option.selected = optionValue === value;
    element.append(option);
  }
  element.addEventListener('change', () => onChange(element.value));
  return element;
}
