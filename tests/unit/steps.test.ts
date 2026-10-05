// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserFacingError } from '../../src/core/errors';
import type { PickedFolder } from '../../src/browser/readFolder';
import { prepareImageAsIs } from '../../src/pdf/images';
import { loadFolder, setAddress, setSizePreset, type Services } from '../../src/ui/actions';
import { mountApp } from '../../src/ui/app';
import type { AppState } from '../../src/ui/state';
import type { Store } from '../../src/ui/store';
import { TODAY } from '../support/library';

/** No contact-info.txt, so the folder step shows its help notice. */
function sampleFolder(): Promise<PickedFolder> {
  const entry = (...path: string[]) => ({ path, file: new File(['x'], path.at(-1) ?? '') });
  return Promise.resolve({
    name: 'Docs',
    entries: [
      entry('Cover Letter.pdf'),
      entry('ID', 'license.jpg'),
      entry('Pay Stubs', '2026-09-18.pdf'),
      entry('Pets', 'dog.jpg'),
    ],
  });
}

const services: Services = {
  createImagePreparer: () => prepareImageAsIs,
  buildPacket: () => Promise.reject(new Error('not used')),
  saveFile: () => {},
};

let store: Store<AppState>;
const find = (selector: string) => document.querySelector<HTMLElement>(selector);
const findAll = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
const tile = (title: string) => find(`[aria-label="Add ${title}"]`);
const card = (title: string) => find(`.card[aria-label="${title}"]`);
const cardTitles = () => findAll('.card-title').map((title) => title.textContent);
const pressKey = (target: HTMLElement | null, key: string) =>
  target?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

beforeEach(() => {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  store = mountApp(root, TODAY, services);
});

describe('re-rendering', () => {
  it('leaves notices in place while the address is typed', async () => {
    await loadFolder(store, sampleFolder());
    const notice = find('#contact-help');
    expect(notice).not.toBeNull();
    setAddress(store, '1 Elm St');
    expect(find('#contact-help')).toBe(notice);
  });

  it('moves the progress bar without rebuilding the cards or tiles', async () => {
    await loadFolder(store, sampleFolder());
    tile('Pay Stubs')?.click();
    const stubsCard = card('Pay Stubs');
    const coverTile = tile('Cover Letter');
    const progress = (value: number) =>
      store.update({ build: { status: 'working', progress: value, label: 'Building your packet…' } });

    progress(0.2);
    const status = find('.progress-block [role="status"]');
    progress(0.6);
    expect(card('Pay Stubs')).toBe(stubsCard);
    expect(tile('Cover Letter')).toBe(coverTile);
    expect(document.querySelector('progress')?.value).toBe(0.6);
    expect(find('.progress-block [role="status"]')).toBe(status);
  });
});

describe('order step keyboard focus', () => {
  it('moves to the next tile after adding one, then to the new card', async () => {
    await loadFolder(store, sampleFolder());
    tile('ID')?.focus();
    tile('ID')?.click();
    expect(document.activeElement).toBe(tile('Pay Stubs'));

    tile('Pets')?.click();
    expect(document.activeElement).toBe(tile('Pay Stubs')); // the last tile: the one before it
    tile('Cover Letter')?.click();
    tile('Pay Stubs')?.click();
    expect(cardTitles()).toEqual(['ID', 'Pets', 'Cover Letter', 'Pay Stubs']);
    expect(document.activeElement).toBe(card('Pay Stubs')); // nothing left to add
  });

  it('moves to the next card after removing one, then back to the tile', async () => {
    await loadFolder(store, sampleFolder());
    for (const title of ['ID', 'Pets', 'Cover Letter']) tile(title)?.click();

    pressKey(card('Pets'), 'Delete');
    expect(cardTitles()).toEqual(['ID', 'Cover Letter']);
    expect(document.activeElement).toBe(card('Cover Letter'));

    pressKey(card('Cover Letter'), 'Delete');
    expect(document.activeElement).toBe(card('ID')); // the last card: the one before it

    pressKey(card('ID'), 'Delete');
    expect(cardTitles()).toEqual([]);
    expect(document.activeElement).toBe(tile('ID'));
  });
});

describe('packet cards', () => {
  it('are named by their title, with the keyboard controls as the description', async () => {
    await loadFolder(store, sampleFolder());
    tile('Pets')?.click();
    const pets = card('Pets');
    expect(pets?.getAttribute('role')).toBe('group');
    const help = document.getElementById(pets?.getAttribute('aria-describedby') ?? '');
    expect(help?.textContent).toContain('Alt plus arrow keys to move and Delete to remove');
  });
});

describe('folder step', () => {
  it('explains an empty folder', async () => {
    find('#folder-input')?.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(find('[role="alert"]')?.textContent).toMatch(/That folder is empty/));
  });

  it('says which folder is still in use after another one fails, keeping its notes', async () => {
    await loadFolder(store, sampleFolder());
    expect(find('.folder-status')?.textContent).toBe('Docs');

    await loadFolder(store, Promise.reject(new UserFacingError('No usable documents in “Junk”.')));
    expect(find('.folder-status')?.textContent).toBe('Still using Docs');
    expect(find('[role="alert"]')?.textContent).toContain('No usable documents in “Junk”.');
    expect(find('#contact-help')).not.toBeNull();

    // Choosing again clears the old error, even if the picker is then cancelled.
    findAll('.folder-row button')[0]?.click();
    expect(find('[role="alert"]')).toBeNull();
    expect(find('.folder-status')?.textContent).toBe('Docs');
  });
});

describe('order step', () => {
  it('says how to order and add items', async () => {
    await loadFolder(store, sampleFolder());
    expect(find('.order-body .hint')?.textContent).toBe('Drag items into any order. Click to add to the bottom.');
  });
});

describe('generate step', () => {
  const trigger = () => find('#file-size');
  const listbox = () => find('[role="listbox"]');
  const options = () => findAll('[role="option"]');
  const accessibleText = (element: HTMLElement | null, attribute: string) =>
    (element?.getAttribute(attribute) ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
      .join(' ');

  it('counts sections and files', async () => {
    await loadFolder(store, sampleFolder());
    tile('Cover Letter')?.click();
    expect(find('#summary')?.textContent).toBe('1 section with 1 file');
    tile('ID')?.click();
    expect(find('#summary')?.textContent).toBe('2 sections with 2 files');
  });

  it('names the chosen size on its button, and lists every size with its explanation', () => {
    expect(accessibleText(trigger(), 'aria-labelledby')).toBe('File size: Balanced');
    expect(trigger()?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(listbox()?.hidden).toBe(true);

    trigger()?.click();
    expect(listbox()?.hidden).toBe(false);
    expect(trigger()?.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(listbox());
    expect(options().map((option) => accessibleText(option, 'aria-labelledby'))).toEqual([
      'Smaller',
      'Balanced',
      'High',
    ]);
    expect(accessibleText(options()[0] ?? null, 'aria-describedby')).toMatch(/^For email and upload limits/);
    expect(options().map((option) => option.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
  });

  it('chooses with the arrow keys and Enter, then returns to the button', () => {
    trigger()?.click();
    expect(listbox()?.getAttribute('aria-activedescendant')).toBe('file-size-balanced');
    pressKey(listbox(), 'ArrowDown');
    expect(listbox()?.getAttribute('aria-activedescendant')).toBe('file-size-high');
    pressKey(listbox(), 'Enter');
    expect(store.get().sizePreset).toBe('high');
    expect(trigger()?.textContent).toBe('High');
    expect(listbox()?.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger());
  });

  it('chooses with a click, and Escape closes without changing anything', () => {
    trigger()?.click();
    options()[0]?.click();
    expect(store.get().sizePreset).toBe('smaller');

    trigger()?.click();
    pressKey(listbox(), 'End');
    pressKey(listbox(), 'Escape');
    expect(store.get().sizePreset).toBe('smaller');
    expect(listbox()?.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger());
  });

  it('shows a size chosen elsewhere', () => {
    setSizePreset(store, 'smaller');
    expect(trigger()?.textContent).toBe('Smaller');
    expect(options().map((option) => option.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
  });

  it('keeps the button focusable while working, and announces errors once', () => {
    const button = find('#generate');
    button?.focus();
    store.update({ build: { status: 'working', progress: 0, label: 'Processing your files…' } });
    expect(button?.hasAttribute('disabled')).toBe(false);
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(button);
    expect((find('#file-size') as HTMLButtonElement).disabled).toBe(true);

    store.update({ build: { status: 'error', message: 'Something went wrong.', details: [] } });
    expect(button?.getAttribute('aria-disabled')).toBe('false');
    const alert = find('[role="alert"]');
    expect(alert?.closest('[aria-live]')).toBeNull();
  });
});
