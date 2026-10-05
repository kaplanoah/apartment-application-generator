import { formatFileSize } from '../core/fileSize';
import { planPacket } from '../core/packet';
import { getSizePreset, SIZE_PRESETS, type SizePresetId } from '../core/sizePresets';
import { generate, setSizePreset, type Services } from './actions';
import { h, replaceChildren } from './dom';
import type { AppState, SizeReport } from './state';
import { hasChanged, type Store } from './store';

/** Many application portals and inboxes stop accepting files around here. */
const LARGE_FILE_BYTES = 10_000_000;
/** Packets at least this big get a breakdown of where the size comes from. */
const REPORT_FROM_BYTES = 5_000_000;
const SECTIONS_IN_REPORT = 4;
const NOTABLE_SAVING_BYTES = 100_000;

/** Step 4: pick a size and build the PDF. */
export function createGenerateStep(store: Store<AppState>, services: Services) {
  const sizeSelect = h('select', {
    'aria-label': 'File size',
    id: 'file-size',
    'aria-describedby': 'file-size-description',
  });
  for (const preset of SIZE_PRESETS) sizeSelect.append(h('option', { value: preset.id }, preset.label));
  sizeSelect.addEventListener('change', () => setSizePreset(store, sizeSelect.value as SizePresetId));
  const sizeDescription = h('p', { class: 'faint', id: 'file-size-description' });
  // Styled like the quiet "through Sep 30" choice on the order cards.
  const sizeChoice = h(
    'span',
    { class: 'size-choice' },
    h('label', { for: 'file-size' }, 'File size:'),
    h('span', { class: 'select small' }, sizeSelect),
  );
  // While working, the button stays focusable (aria-disabled rather than
  // disabled, which would drop keyboard focus); generate() ignores clicks then.
  const button = h(
    'button',
    { type: 'button', class: 'button primary', id: 'generate', onclick: () => void generate(store, services) },
    'Generate PDF',
  );
  const summary = h('p', { class: 'hint', id: 'summary' });
  // Not a live region itself: each notice placed in it announces itself.
  const result = h('div');
  const progressBar = h('progress', { class: 'progress', max: 1, value: 0, 'aria-label': 'Progress' });
  const progressLabel = h('span', { class: 'hint', role: 'status' });
  const progressBlock = h('div', { class: 'progress-block' }, progressLabel, progressBar);

  const element = h(
    'section',
    { class: 'step', 'aria-labelledby': 'step-generate' },
    h('h2', { id: 'step-generate' }, h('span', { class: 'step-num' }, '4'), 'Generate'),
    h(
      'div',
      { class: 'generate-row' },
      h('div', { class: 'generate-summary' }, summary, sizeChoice, sizeDescription),
      button,
    ),
    result,
  );

  function update(state: AppState, previous?: AppState): void {
    if (hasChanged(state, previous, 'sizePreset')) {
      sizeSelect.value = state.sizePreset;
      sizeDescription.textContent = getSizePreset(state.sizePreset).description;
    }
    if (hasChanged(state, previous, 'folder', 'packet')) renderSummary(state);
    if (hasChanged(state, previous, 'build')) renderBuild(state);
  }

  function renderSummary(state: AppState): void {
    const sections = state.folder ? planPacket(state.folder.library, state.packet, state.today) : [];
    const files = sections.reduce((sum, section) => sum + section.documents.length, 0);
    summary.textContent = !state.folder
      ? 'Add your folder to get started.'
      : sections.length === 0
        ? 'Add at least one folder or file to the order.'
        : `${sections.length} ${sections.length === 1 ? 'section' : 'sections'}, ${files} ${files === 1 ? 'file' : 'files'}, plus a cover page.`;
  }

  function renderBuild(state: AppState): void {
    const build = state.build;
    const working = build.status === 'working';
    button.setAttribute('aria-disabled', String(working));
    button.textContent = working ? 'Working…' : 'Generate PDF';
    // The size can't change partway through: the build uses the one it started with.
    sizeSelect.disabled = working;
    switch (build.status) {
      case 'idle':
        replaceChildren(result);
        break;
      case 'working':
        progressBar.value = build.progress;
        // Rewriting the same text would make screen readers announce it again.
        if (progressLabel.textContent !== build.label) progressLabel.textContent = build.label;
        if (!result.contains(progressBlock)) replaceChildren(result, progressBlock);
        break;
      case 'error':
        replaceChildren(
          result,
          h(
            'div',
            { class: 'notice error', role: 'alert' },
            h('p', null, build.message),
            build.details.length > 0 && h('ul', null, ...build.details.map((detail) => h('li', null, detail))),
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
              ` to your Downloads folder: ${build.pageCount} pages, ${formatFileSize(build.byteLength)}.`,
            ),
            build.byteLength >= REPORT_FROM_BYTES && sizeBreakdown(build.sizeReport),
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

/** The biggest sections, how much shrinking saved, and a note on starting with smaller files. */
function sizeBreakdown(report: SizeReport): HTMLElement {
  return h(
    'div',
    { class: 'size-report' },
    h('p', null, 'Where the size comes from:'),
    h(
      'ul',
      null,
      ...report.sections
        .slice(0, SECTIONS_IN_REPORT)
        .map((section) =>
          h(
            'li',
            null,
            `${section.title}: `,
            section.before - section.after >= NOTABLE_SAVING_BYTES
              ? `${formatFileSize(section.before)} → about ${formatFileSize(section.after)}`
              : formatFileSize(section.after),
          ),
        ),
    ),
    report.sharedSaved >= NOTABLE_SAVING_BYTES &&
      h('p', null, `Repeated images and fonts are stored once, which saved ${formatFileSize(report.sharedSaved)}.`),
    h(
      'p',
      { class: 'faint' },
      'Good to know: scans made at 300 dpi, or with the iPhone Notes scanner, start out much smaller than 600 dpi scans or photos.',
    ),
  );
}
