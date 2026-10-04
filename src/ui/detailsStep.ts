import { CONTACT_FILE_EXAMPLE, CONTACT_FILE_NAME, formatContactDetail } from '../core/contactInfo';
import { setAddress, setFooter } from './actions';
import { h, replaceChildren } from './dom';
import type { AppState } from './state';
import type { Store } from './store';

/** Step 1: apartment address, footer, and the applicants read from the folder. */
export function createDetailsStep(store: Store<AppState>) {
  const address = h('input', {
    id: 'address',
    type: 'text',
    autocomplete: 'off',
    spellcheck: 'false',
    maxlength: 200,
    placeholder: '123 Main St, Apt 4B',
    oninput: () => setAddress(store, address.value),
  });
  const footer = h('input', {
    id: 'footer',
    type: 'text',
    autocomplete: 'off',
    maxlength: 200,
    placeholder: 'Fills in from the address',
    oninput: () => setFooter(store, footer.value),
  });
  const applicants = h('div', { class: 'applicants', 'aria-live': 'polite' });

  const element = h(
    'section',
    { class: 'step', 'aria-labelledby': 'step-details' },
    h('h2', { id: 'step-details' }, h('span', { class: 'step-num' }, '1'), 'Your details'),
    h(
      'div',
      { class: 'fields' },
      h('label', { class: 'field', for: 'address' }, h('span', null, 'Apartment address'), address),
      h('label', { class: 'field', for: 'footer' }, h('span', null, 'Footer on every page'), footer),
    ),
    applicants,
  );

  function update(state: AppState, previous?: AppState): void {
    if (footer.value !== state.footer && document.activeElement !== footer) footer.value = state.footer;
    if (previous && previous.folder === state.folder) return;
    renderApplicants(applicants, state);
  }

  update(store.get());
  return { element, update };
}

function renderApplicants(container: HTMLElement, state: AppState): void {
  const contact = state.folder?.contact;
  const label = h('span', { class: 'label' }, 'Applicants');

  if (!contact) {
    replaceChildren(
      container,
      label,
      h(
        'p',
        { class: 'hint' },
        'Names and contact info come from ',
        h('code', null, CONTACT_FILE_NAME),
        ' in your documents folder (step 2).',
      ),
    );
    return;
  }
  if (contact.status === 'loaded' && contact.info.applicants.length > 0) {
    replaceChildren(
      container,
      label,
      h(
        'ul',
        { class: 'people' },
        ...contact.info.applicants.map((person) =>
          h(
            'li',
            null,
            h('strong', null, person.name),
            ...person.details.map((detail) => h('span', null, formatContactDetail(detail))),
          ),
        ),
      ),
      contact.info.problems.length > 0 &&
        h(
          'div',
          { class: 'notice warn' },
          h('p', null, `Some lines in ${CONTACT_FILE_NAME} were skipped:`),
          h('ul', null, ...contact.info.problems.map((p) => h('li', null, p))),
        ),
      h(
        'p',
        { class: 'hint' },
        'From ',
        h('code', null, CONTACT_FILE_NAME),
        '. To change them, edit that file and add the folder again.',
      ),
    );
    return;
  }

  const why =
    contact.status === 'missing'
      ? `There’s no ${CONTACT_FILE_NAME} in “${state.folder?.name ?? ''}”, so the cover won’t list any names.`
      : contact.status === 'unreadable'
        ? contact.reason
        : `${CONTACT_FILE_NAME} has no names in it.`;
  const problems = contact.status === 'loaded' ? contact.info.problems : [];
  replaceChildren(
    container,
    label,
    h(
      'div',
      { class: 'notice warn', role: 'status' },
      h('p', null, why),
      problems.length > 0 && h('ul', null, ...problems.map((p) => h('li', null, p))),
      h(
        'p',
        null,
        'To add them, create a plain-text file named ',
        h('code', null, CONTACT_FILE_NAME),
        ' at the top of the folder, like this (in TextEdit choose Format → Make Plain Text):',
      ),
      h('pre', { class: 'example' }, CONTACT_FILE_EXAMPLE),
      h(
        'p',
        null,
        'One “Label: value” per line, a blank line between people, and each person starts with Name. Then add the folder again.',
      ),
    ),
  );
}
