import { planPacket } from '../core/packet';
import { SIZE_PRESETS, type SizePresetId } from '../core/sizePresets';
import { generate, type Services } from './actions';
import { h, replaceChildren } from './dom';
import type { AppState } from './state';
import type { Store } from './store';

/** Many application portals and inboxes stop accepting files around here. */
const LARGE_FILE_BYTES = 10 * 1024 * 1024;

/** Step 4: pick a size and build the PDF. */
export function createGenerateStep(store: Store<AppState>, services: Services) {
  const sizes = h(
    'fieldset',
    { class: 'sizes' },
    h('legend', null, 'File size'),
    ...SIZE_PRESETS.map((preset) => {
      const radio = h('input', { type: 'radio', name: 'size', value: preset.id, id: `size-${preset.id}` });
      radio.addEventListener('change', () =>
        store.update({ sizePreset: preset.id as SizePresetId, build: { status: 'idle' } }),
      );
      return h(
        'label',
        { class: 'size', for: `size-${preset.id}` },
        radio,
        h('span', { class: 'size-label' }, preset.label),
        h('span', { class: 'size-help' }, preset.description),
      );
    }),
  );
  const button = h(
    'button',
    { type: 'button', class: 'button primary', id: 'generate', onclick: () => void generate(store, services) },
    'Generate PDF',
  );
  const summary = h('p', { class: 'hint', id: 'summary' });
  const result = h('div', { 'aria-live': 'polite' });
  const progressBar = h('progress', { class: 'progress', max: 1, value: 0, 'aria-label': 'Progress' });
  const progressLabel = h('span', { class: 'hint' });
  const progressBlock = h('div', { class: 'progress-block' }, progressLabel, progressBar);

  const element = h(
    'section',
    { class: 'step', 'aria-labelledby': 'step-generate' },
    h('h2', { id: 'step-generate' }, h('span', { class: 'step-num' }, '4'), 'Generate'),
    sizes,
    h(
      'p',
      { class: 'faint' },
      'Text is never changed, so it stays sharp. Only photos and scanned images, including those inside PDFs, are resized.',
    ),
    h('div', { class: 'generate-row' }, summary, button),
    result,
  );

  function update(state: AppState): void {
    for (const radio of sizes.querySelectorAll<HTMLInputElement>('input[type=radio]'))
      radio.checked = radio.value === state.sizePreset;

    const sections = state.folder ? planPacket(state.folder.library, state.packet, state.today) : [];
    const files = sections.reduce((sum, section) => sum + section.documents.length, 0);
    const working = state.build.status === 'working';
    button.disabled = working || sections.length === 0;
    button.textContent = working ? 'Working…' : 'Generate PDF';
    summary.textContent = !state.folder
      ? 'Add your folder to get started.'
      : sections.length === 0
        ? 'Add at least one folder or file to the order.'
        : `${sections.length} ${sections.length === 1 ? 'section' : 'sections'}, ${files} ${files === 1 ? 'file' : 'files'}, plus a cover page.`;

    const build = state.build;
    switch (build.status) {
      case 'idle':
        replaceChildren(result);
        break;
      case 'working':
        progressBar.value = build.progress;
        progressLabel.textContent = build.label;
        if (!result.contains(progressBlock)) replaceChildren(result, progressBlock);
        break;
      case 'error':
        replaceChildren(
          result,
          h(
            'div',
            { class: 'notice error', role: 'alert' },
            h('p', null, build.message),
            build.details.length > 0 && h('ul', null, ...build.details.map((d) => h('li', null, d))),
          ),
        );
        break;
      case 'done':
        replaceChildren(
          result,
          h(
            'div',
            { class: 'notice success', role: 'status' },
            h(
              'p',
              null,
              'Saved ',
              h('strong', null, build.fileName),
              ` to your Downloads folder: ${build.pageCount} pages, ${formatBytes(build.byteLength)}.`,
            ),
            build.byteLength > LARGE_FILE_BYTES &&
              h(
                'p',
                null,
                state.sizePreset === 'smaller'
                  ? 'That’s large for email and many upload forms, which often stop around 10 MB. You may need to send it in two parts.'
                  : 'That’s large for email and many upload forms. Choose “Smaller” and generate again.',
              ),
          ),
        );
        break;
    }
  }

  update(store.get());
  return { element, update };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
