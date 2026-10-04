import { folderFromDrop, folderFromInput } from '../browser/readFolder';
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
    { type: 'button', class: 'button secondary', onclick: () => input.click() },
    'Choose folder…',
  );
  const status = h('div', { class: 'drop-status', 'aria-live': 'polite' });
  const feedback = h('div');
  const zone = h(
    'div',
    { class: 'dropzone', id: 'dropzone' },
    h('p', { class: 'drop-title' }, 'Drag your documents folder here'),
    h('p', { class: 'hint' }, 'or ', chooseButton),
    status,
    input,
  );

  // A folder dropped just outside the zone would make the browser open it and
  // leave the app, so file drops anywhere else on the page are ignored.
  for (const type of ['dragover', 'drop'] as const) {
    window.addEventListener(type, (event) => {
      if (event.dataTransfer?.types.includes('Files') && !zone.contains(event.target as Node)) event.preventDefault();
    });
  }

  zone.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', (event) => {
    if (!zone.contains(event.relatedTarget as Node | null)) zone.classList.remove('over');
  });
  zone.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    zone.classList.remove('over');
    void loadFolder(store, folderFromDrop(event.dataTransfer));
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
      replaceChildren(
        status,
        h('strong', null, `“${state.folder.name}”`),
        ` · ${count} ${count === 1 ? 'item' : 'items'} to arrange`,
      );
    } else {
      replaceChildren(status, 'Reads PDFs and photos (JPG, PNG, HEIC), loose or in folders.');
    }
    zone.classList.toggle('loaded', state.folder !== null);

    const ignored = state.folder?.library.ignored ?? [];
    replaceChildren(
      feedback,
      state.folderError &&
        h(
          'div',
          { class: 'notice error', role: 'alert' },
          h('p', null, state.folderError.message),
          state.folderError.details.length > 0 &&
            h('ul', null, ...state.folderError.details.map((d) => h('li', null, d))),
        ),
      !state.folderError &&
        ignored.length > 0 &&
        h(
          'p',
          { class: 'faint' },
          'Not used: ',
          ignored
            .map(
              (item) =>
                `${item.path} (${item.reason === 'unsupported-type' ? 'file type not supported' : 'no PDFs or photos inside'})`,
            )
            .join(', '),
        ),
    );
  }

  update(store.get());
  return { element, update };
}
