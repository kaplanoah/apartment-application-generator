import { findOption, moveItem, newPacketItem } from '../core/packet';
import type { LibraryOption } from '../core/library';
import { setPacket } from './actions';
import { findByFocusKey, h, preservingFocus, replaceChildren } from './dom';
import { optionIcon } from './icons';
import { cardFocusKey, cardHelp, packetCard } from './packetCard';
import type { AppState } from './state';
import { hasChanged, type Store } from './store';

type DragSource =
  { readonly from: 'pool'; readonly optionId: string } | { readonly from: 'packet'; readonly index: number };

/**
 * Drags carry this private type rather than text, so dropping a tile or card
 * on a text field (or another app) inserts nothing.
 */
const DRAG_TYPE = 'application/x-packet-item';

const tileFocusKey = (optionId: string) => `tile:${optionId}`;

/** Step 3: tiles for every top-level folder and file, dragged into an ordered list. */
export function createOrderStep(store: Store<AppState>) {
  const pool = h('ul', { class: 'pool', 'aria-label': 'Folders and files you can add' });
  const list = h('ol', { class: 'packet', 'aria-label': 'Packet order' });
  const body = h('div', { class: 'order-body' });
  let drag: DragSource | null = null;
  const dropLine = h('li', { class: 'drop-line', 'aria-hidden': 'true' });

  const insertAt = (index: number, source: DragSource) => {
    const { packet, folder } = store.get();
    if (source.from === 'pool') {
      const option = folder && findOption(folder.library, source.optionId);
      if (option && !packet.some((item) => item.optionId === option.id)) {
        setPacket(store, [...packet.slice(0, index), newPacketItem(option), ...packet.slice(index)]);
      }
    } else {
      setPacket(store, moveItem(packet, source.index, index));
    }
  };

  // Dropping on the list inserts at the pointer; dropping on the pool removes.
  list.addEventListener('dragover', (event) => {
    if (!drag) return;
    event.preventDefault();
    showDropLine(dropIndex(event.clientY));
  });
  list.addEventListener('dragleave', (event) => {
    if (!list.contains(event.relatedTarget as Node | null)) dropLine.remove();
  });
  list.addEventListener('drop', (event) => {
    if (!drag) return;
    event.preventDefault();
    const source = drag;
    endDrag();
    insertAt(dropIndex(event.clientY), source);
  });
  pool.addEventListener('dragover', (event) => {
    if (drag?.from === 'packet') event.preventDefault();
  });
  pool.addEventListener('drop', (event) => {
    if (drag?.from !== 'packet') return;
    event.preventDefault();
    const index = drag.index;
    endDrag();
    setPacket(
      store,
      store.get().packet.filter((_, position) => position !== index),
    );
  });

  function dropIndex(y: number): number {
    const rows = Array.from(list.querySelectorAll<HTMLElement>('.row'));
    const index = rows.findIndex((row) => {
      const box = row.getBoundingClientRect();
      return y < box.top + box.height / 2;
    });
    return index === -1 ? rows.length : index;
  }
  function showDropLine(index: number): void {
    const rows = list.querySelectorAll('.row');
    list.insertBefore(dropLine, rows[index] ?? null);
  }
  function startDrag(event: DragEvent, source: DragSource): void {
    drag = source;
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(DRAG_TYPE, source.from === 'pool' ? source.optionId : String(source.index));
    event.dataTransfer.effectAllowed = 'move';
  }
  function endDrag(): void {
    drag = null;
    dropLine.remove();
    list.querySelectorAll('.dragging').forEach((node) => node.classList.remove('dragging'));
  }

  const element = h(
    'section',
    { class: 'step', 'aria-labelledby': 'step-order' },
    h('h2', { id: 'step-order' }, h('span', { class: 'step-num' }, '3'), 'Order'),
    body,
  );

  function render(state: AppState, previous?: AppState): void {
    if (!hasChanged(state, previous, 'folder', 'packet')) return;
    const folder = state.folder;
    if (!folder) {
      replaceChildren(body, h('p', { class: 'hint' }, 'Add your documents folder first.'));
      return;
    }
    if (!body.contains(pool)) {
      replaceChildren(
        body,
        h('p', { class: 'hint' }, 'Drag items in order. Click to add it to the end.'),
        pool,
        list,
        cardHelp(),
      );
    }
    preservingFocus(pool, () => renderPool(state, folder.library.options));
    preservingFocus(list, () => renderList(state));
  }

  function renderPool(state: AppState, options: readonly LibraryOption<File>[]): void {
    const used = new Set(state.packet.map((item) => item.optionId));
    const available = options.filter((option) => !used.has(option.id));
    replaceChildren(
      pool,
      ...available.map((option, position) => {
        const tile = h(
          'button',
          {
            type: 'button',
            class: 'tile',
            draggable: 'true',
            'aria-label': `Add ${option.title}`,
            'data-focus-key': tileFocusKey(option.id),
          },
          option.title,
          optionIcon(option),
        );
        tile.addEventListener('click', () => {
          insertAt(store.get().packet.length, { from: 'pool', optionId: option.id });
          // Keep going from the same place in the pool, so pressing Enter again adds the next one.
          if (!focusNearest(pool.querySelectorAll('.tile'), position)) {
            findByFocusKey(list, cardFocusKey(option.id))?.focus();
          }
        });
        tile.addEventListener('dragstart', (event) => startDrag(event, { from: 'pool', optionId: option.id }));
        tile.addEventListener('dragend', endDrag);
        return h('li', null, tile);
      }),
      available.length === 0 &&
        h('li', { class: 'faint' }, 'Everything is in the list. Drag a card back here to remove it.'),
    );
  }

  function renderList(state: AppState): void {
    const folder = state.folder;
    if (!folder) return;
    list.classList.toggle('empty', state.packet.length === 0);
    if (state.packet.length === 0) {
      replaceChildren(
        list,
        h('li', { class: 'empty-note' }, 'Drag folders and files here, in the order they should appear.'),
      );
      return;
    }
    replaceChildren(
      list,
      ...state.packet.map((item, index) => {
        const option = findOption(folder.library, item.optionId);
        if (!option) return null;
        const row = packetCard(option, item, index, state.today, {
          onRangeChange: (range) =>
            setPacket(
              store,
              state.packet.map((existing, position) => (position === index ? { ...existing, range } : existing)),
            ),
        });
        const card = row.querySelector<HTMLElement>('.card');
        card?.addEventListener('dragstart', (event) => {
          if (event.target !== card) return;
          startDrag(event, { from: 'packet', index });
          if (event.dataTransfer) showAsTile(event.dataTransfer, option);
          requestAnimationFrame(() => row.classList.add('dragging'));
        });
        card?.addEventListener('dragend', endDrag);
        // Controls inside a draggable card must stay usable.
        card?.addEventListener('pointerdown', (event) => {
          card.draggable = !(event.target as Element).closest('select');
        });
        card?.addEventListener('keydown', (event) => {
          if (event.target !== card) return;
          if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault();
            const to = event.key === 'ArrowUp' ? index - 1 : index + 2;
            if (to >= 0 && to <= state.packet.length) setPacket(store, moveItem(state.packet, index, to));
          } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            setPacket(
              store,
              state.packet.filter((_, position) => position !== index),
            );
            // The next card takes its place; after the last one, the tile it went back to.
            if (!focusNearest(list.querySelectorAll('.card'), index)) {
              findByFocusKey(pool, tileFocusKey(option.id))?.focus();
            }
          }
        });
        return row;
      }),
    );
  }

  render(store.get());
  return { element, update: render };
}

/** Focuses the element now at `index`, or the one before it. Returns false when there's neither. */
function focusNearest(elements: NodeListOf<Element>, index: number): boolean {
  const target = elements[index] ?? elements[index - 1];
  if (!(target instanceof HTMLElement)) return false;
  target.focus();
  return true;
}

/**
 * While a card is dragged, the pointer carries a compact tile like the ones
 * in the pool, so it reads as "put back" or "move" rather than a whole card.
 * The browser snapshots the element at drag start, so it can be removed
 * right after.
 */
function showAsTile(dataTransfer: DataTransfer, option: LibraryOption<File>): void {
  const ghost = h('span', { class: 'tile drag-ghost', 'aria-hidden': 'true' }, option.title, optionIcon(option));
  document.body.append(ghost);
  dataTransfer.setDragImage(ghost, 18, ghost.offsetHeight / 2);
  setTimeout(() => ghost.remove(), 0);
}
