import { DEFAULT_SIZE_PRESET, SIZE_PRESETS, type SizePresetId } from '../core/sizePresets';
import { h } from './dom';

const LABEL_ID = 'file-size-label';
const LIST_ID = 'file-size-list';
const optionId = (id: SizePresetId) => `file-size-${id}`;

/**
 * "File size: Balanced", opening a list of every size with its explanation.
 * A native select can't show a line of explanation under each choice, so this
 * follows the ARIA select-only combobox pattern: a button that opens a listbox
 * with the keyboard focus, moved with arrow keys.
 */
export function createSizeMenu(onChoose: (id: SizePresetId) => void) {
  const trigger = h('button', {
    type: 'button',
    class: 'menu-trigger',
    id: 'file-size',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
    'aria-controls': LIST_ID,
    'aria-labelledby': `${LABEL_ID} file-size`,
  });
  const options = SIZE_PRESETS.map((preset) =>
    h(
      'li',
      {
        role: 'option',
        class: 'menu-option',
        id: optionId(preset.id),
        'aria-labelledby': `${optionId(preset.id)}-name`,
        'aria-describedby': `${optionId(preset.id)}-description`,
        'data-preset': preset.id,
      },
      h('span', { class: 'menu-check', 'aria-hidden': 'true' }),
      h(
        'span',
        { class: 'menu-text' },
        h('span', { class: 'menu-name', id: `${optionId(preset.id)}-name` }, preset.label),
        h('span', { class: 'menu-description', id: `${optionId(preset.id)}-description` }, preset.description),
      ),
    ),
  );
  const listbox = h(
    'ul',
    { class: 'menu-list', role: 'listbox', id: LIST_ID, tabindex: -1, 'aria-labelledby': LABEL_ID, hidden: true },
    ...options,
  );
  const element = h('span', { class: 'size-menu' }, h('span', { id: LABEL_ID }, 'File size:'), trigger, listbox);

  let chosen: SizePresetId = DEFAULT_SIZE_PRESET;
  let active = 0;

  function setActive(index: number): void {
    active = (index + options.length) % options.length;
    options.forEach((option, position) => option.classList.toggle('active', position === active));
    const preset = SIZE_PRESETS[active];
    if (preset) listbox.setAttribute('aria-activedescendant', optionId(preset.id));
  }
  function open(): void {
    trigger.setAttribute('aria-expanded', 'true');
    listbox.hidden = false;
    setActive(SIZE_PRESETS.findIndex((preset) => preset.id === chosen));
    listbox.focus();
    listbox.scrollIntoView({ block: 'nearest' });
  }
  function close(refocus: boolean): void {
    trigger.setAttribute('aria-expanded', 'false');
    listbox.hidden = true;
    if (refocus) trigger.focus();
  }
  function choose(index: number): void {
    const preset = SIZE_PRESETS[index];
    close(true);
    if (preset && preset.id !== chosen) onChoose(preset.id);
  }

  trigger.addEventListener('click', () => (listbox.hidden ? open() : close(true)));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    }
  });
  // Clicks keep the focus where it is, so clicking the button again closes the list
  // rather than the list closing on blur and the click opening it again.
  for (const target of [trigger, listbox]) {
    target.addEventListener('mousedown', (event) => event.preventDefault());
  }
  options.forEach((option, index) => {
    option.addEventListener('pointermove', () => setActive(index));
    option.addEventListener('click', () => choose(index));
  });
  listbox.addEventListener('keydown', (event) => {
    const moves: Record<string, number> = {
      ArrowDown: active + 1,
      ArrowUp: active - 1,
      Home: 0,
      End: options.length - 1,
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      setActive(move);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
  });
  listbox.addEventListener('focusout', () => close(false));

  /** Shows the chosen size, and stops choosing while a build is using it. */
  function update(sizePreset: SizePresetId, disabled: boolean): void {
    chosen = sizePreset;
    const preset = SIZE_PRESETS.find((candidate) => candidate.id === sizePreset);
    trigger.textContent = preset?.label ?? '';
    for (const option of options) {
      option.setAttribute('aria-selected', String(option.dataset.preset === sizePreset));
    }
    trigger.disabled = disabled;
    if (disabled && !listbox.hidden) close(false);
  }

  return { element, update };
}
