import { setAddress } from './actions';
import { h } from './dom';
import type { AppState } from './state';
import type { Store } from './store';

/** Step 1: the apartment's address, used on the cover, in the footer and in the file name. */
export function createDetailsStep(store: Store<AppState>) {
  const address = h('input', {
    id: 'address',
    type: 'text',
    autocomplete: 'off',
    spellcheck: 'false',
    maxlength: 200,
    placeholder: '123 Main St, Apt 4B',
    'aria-label': 'Address',
    oninput: () => setAddress(store, address.value),
  });

  const element = h(
    'section',
    { class: 'step', 'aria-labelledby': 'step-details' },
    h('h2', { id: 'step-details' }, h('span', { class: 'step-num' }, '1'), 'Address'),
    h('div', { class: 'field' }, address),
  );

  return { element };
}
