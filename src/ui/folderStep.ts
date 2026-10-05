import { folderFromInput } from '../browser/readFolder';
import { CONTACT_FILE_EXAMPLE, CONTACT_FILE_NAME } from '../core/contactInfo';
import { loadFolder } from './actions';
import { h, replaceChildren } from './dom';
import type { AppState } from './state';
import type { Store } from './store';

/** Step 2: drop or choose the documents folder, with clear feedback on problems. */
export function createFolderStep(store: Store<AppState>) {
  const input = h('input', {
    type: 'file',
    class: 'visually-hidden',
    id: 'folder-input',
    tabindex: -1,
    'aria-hidden': 'true',
  });
  input.setAttribute('webkitdirectory', '');
  input.addEventListener('change', () => {
    // Copy the list first: resetting the input (so the same folder can be
    // picked again) empties it.
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length > 0)
      void loadFolder(
        store,
        Promise.resolve().then(() => folderFromInput(files)),
      );
  });

  const chooseButton = h(
    'button',
    { type: 'button', class: 'button primary', onclick: () => input.click() },
    'Choose folder…',
  );
  const status = h('div', { class: 'drop-status', 'aria-live': 'polite' });
  const feedback = h('div');
  const zone = h(
    'div',
    { class: 'dropzone', id: 'dropzone' },
    chooseButton,
    status,
    h(
      'p',
      { class: 'faint' },
      'Drag and drop isn’t supported: browsers don’t read large, nested folders reliably that way.',
    ),
    input,
  );

  // A folder dropped on the page would make the browser open it and leave
  // the app, so drops are caught everywhere and answered with a pointer to
  // the button instead.
  window.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  });
  window.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    store.update({
      folderError: {
        message: 'Drag and drop isn’t supported. Click “Choose folder…” and pick your folder.',
        details: [],
      },
    });
  });

  const element = h(
    'section',
    { class: 'step', 'aria-labelledby': 'step-folder' },
    h('h2', { id: 'step-folder' }, h('span', { class: 'step-num' }, '2'), 'Documents folder'),
    zone,
    feedback,
  );

  function update(state: AppState): void {
    if (state.folderLoading) {
      replaceChildren(status, 'Reading folder…');
    } else if (state.folder) {
      const count = state.folder.library.options.length;
      const contact = state.folder.contact;
      const people = contact.status === 'loaded' ? contact.info.applicants.length : 0;
      replaceChildren(
        status,
        h('strong', null, `“${state.folder.name}”`),
        ` · ${count} ${count === 1 ? 'item' : 'items'} to arrange`,
        people > 0 && ` · contact info for ${people} ${people === 1 ? 'person' : 'people'}`,
      );
    } else {
      replaceChildren(
        status,
        'Pick the folder that holds your documents: PDFs, photos (JPG, PNG, HEIC) and text files.',
      );
    }
    zone.classList.toggle('loaded', state.folder !== null);

    const ignored = state.folder?.library.ignored ?? [];
    const needPdf = ignored.filter((item) => item.reason === 'needs-pdf');
    const unused = ignored.filter((item) => item.reason !== 'needs-pdf');
    replaceChildren(
      feedback,
      !state.folderError && contactNotice(state),
      state.folderError &&
        h(
          'div',
          { class: 'notice error', role: 'alert' },
          h('p', null, state.folderError.message),
          state.folderError.details.length > 0 &&
            h('ul', null, ...state.folderError.details.map((d) => h('li', null, d))),
        ),
      !state.folderError &&
        needPdf.length > 0 &&
        h(
          'div',
          { class: 'notice warn', role: 'status' },
          h('p', null, needPdf.length === 1 ? 'Save this as a PDF to use it:' : 'Save these as PDFs to use them:'),
          h(
            'ul',
            null,
            ...needPdf.map((item) =>
              h('li', null, h('strong', null, item.path), ` — ${item.exportSteps ?? 'export it as PDF'}`),
            ),
          ),
          h('p', null, 'Keep the PDF next to the original with the same name, then add the folder again.'),
        ),
      !state.folderError &&
        unused.length > 0 &&
        h(
          'p',
          { class: 'faint' },
          'Not used: ',
          unused
            .map(
              (item) =>
                `${item.path} (${item.reason === 'unsupported-type' ? 'file type not supported' : 'nothing usable inside'})`,
            )
            .join(', '),
        ),
    );
  }

  update(store.get());
  return { element, update };
}

/** Explains contact-info.txt when it's missing or has lines that couldn't be used. */
function contactNotice(state: AppState): HTMLElement | null {
  const contact = state.folder?.contact;
  if (!contact) return null;
  const problems = contact.status === 'loaded' ? contact.info.problems : [];
  const hasPeople = contact.status === 'loaded' && contact.info.applicants.length > 0;
  if (hasPeople && problems.length === 0) return null;

  if (hasPeople) {
    return h(
      'div',
      { class: 'notice warn', role: 'status' },
      h('p', null, `Some lines in ${CONTACT_FILE_NAME} were skipped:`),
      h('ul', null, ...problems.map((problem) => h('li', null, problem))),
    );
  }
  const why =
    contact.status === 'missing'
      ? `There’s no ${CONTACT_FILE_NAME} in “${state.folder?.name ?? ''}”, so the cover won’t list any names or contact details.`
      : contact.status === 'unreadable'
        ? contact.reason
        : `${CONTACT_FILE_NAME} has no names in it.`;
  return h(
    'div',
    { class: 'notice warn', role: 'status', id: 'contact-help' },
    h('p', null, why),
    problems.length > 0 && h('ul', null, ...problems.map((problem) => h('li', null, problem))),
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
  );
}
