import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import {
  encryptedPdf,
  sampleFolderFiles,
  sampleIdJpeg,
  samplePdf,
  withExifOrientation,
  writeFiles,
} from '../../scripts/lib/sampleDocs.ts';
import { readPdf } from '../support/pdfText.ts';

const APP_URL = new URL('../../dist/index.html', import.meta.url).href;

let workspace: string;
let docsFolder: string;
let noContactFolder: string;
let unusableFolder: string;
let lockedFolder: string;
let photosFolder: string;
let bigPhotoBytes: number;

test.beforeAll(async ({ browser }) => {
  workspace = await mkdtemp(join(tmpdir(), 'packet-e2e-'));
  const files = await sampleFolderFiles();

  docsFolder = join(workspace, 'Apartment Docs');
  await writeFiles(docsFolder, files);

  noContactFolder = join(workspace, 'No Contact');
  await writeFiles(noContactFolder, new Map([['Cover Letter.pdf', files.get('Cover Letter.pdf') as Uint8Array]]));

  unusableFolder = join(workspace, 'Unusable');
  await writeFiles(
    unusableFolder,
    new Map([
      ['notes.txt', new TextEncoder().encode('hello')],
      ['Old/readme.docx', new Uint8Array([1, 2, 3])],
    ]),
  );

  lockedFolder = join(workspace, 'Locked');
  await writeFiles(
    lockedFolder,
    new Map([
      ['Bank Statements/2026-09.pdf', await encryptedPdf()],
      ['Cover Letter.pdf', await samplePdf('Cover Letter')],
    ]),
  );

  // Photos stored sideways with an EXIF "rotate 90°" tag, as iPhones do: a
  // large detailed one (gets resized) and a small one (kept as-is), plus a
  // plain wide photo.
  const scratch = await browser.newPage();
  const bigPhoto = await scratch.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 2000;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    const pixels = context.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i++) pixels.data[i] = (i * 2654435761) >>> 24;
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1] as string;
  });
  await scratch.close();
  const big = withExifOrientation(new Uint8Array(Buffer.from(bigPhoto, 'base64')), 6);
  bigPhotoBytes = big.byteLength;
  photosFolder = join(workspace, 'Photos');
  await writeFiles(
    photosFolder,
    new Map([
      ['ID/a-big-sideways.jpg', big],
      ['ID/b-small-sideways.jpg', withExifOrientation(sampleIdJpeg(), 6)],
      ['ID/c-wide.jpg', sampleIdJpeg()],
    ]),
  );
});

test.afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

/** Opens the app and records anything that isn't the local file itself. */
async function openApp(page: Page) {
  const outside: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (!/^(file|blob|data):/.test(request.url())) outside.push(request.url());
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-10-04T12:00:00'));
  await page.goto(APP_URL);
  return { outside, errors };
}

const chooseFolder = (page: Page, folder: string) => page.locator('#folder-input').setInputFiles(folder);
const addTile = (page: Page, title: string) => page.getByRole('button', { name: `Add ${title}`, exact: true }).click();
const card = (page: Page, title: string) =>
  page.locator('.row').filter({ has: page.locator('.card-title', { hasText: title }) });

test('says it is local-only and ships a strict no-network policy', async ({ page }) => {
  const { outside, errors } = await openApp(page);
  await expect(page.getByRole('note')).toContainText('never connects to the internet');

  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("connect-src 'none'");
  expect(policy).not.toContain('unsafe-inline');

  // The browser itself refuses network access from the page.
  const fetchResult = await page.evaluate(() =>
    fetch('https://example.com/').then(
      () => 'sent',
      () => 'blocked',
    ),
  );
  expect(fetchResult).toBe('blocked');
  expect(outside).toEqual([]);
  expect(
    errors.filter(
      (e) => !e.includes('Content Security Policy') && !e.includes('Failed to fetch') && !e.includes('example.com'),
    ),
  ).toEqual([]);
});

test('builds a packet in the chosen order with cover, contents, links and footers', async ({ page }) => {
  const { outside, errors } = await openApp(page);
  await page.getByLabel('Apartment address').fill('123 Main St, Apt 4B');
  await expect(page.getByLabel('Footer on every page')).toHaveValue(
    'For 123 Main St, Apt 4B application only · Oct 2026',
  );

  await chooseFolder(page, docsFolder);
  await expect(page.locator('.drop-status')).toContainText('“Apartment Docs”');
  await expect(page.locator('.people')).toContainText('Noah Example');
  await expect(page.locator('.people')).toContainText('anna@example.com');

  // Drag one tile in, click the rest.
  await page.getByRole('button', { name: 'Add Cover Letter', exact: true }).dragTo(page.locator('.packet'));
  await addTile(page, 'Pay Stubs');
  await addTile(page, 'W-2s');
  await addTile(page, 'Bank Statements');

  await expect(card(page, 'Pay Stubs').locator('.count')).toHaveText('8 files'); // Aug + Sep, both people
  await expect(card(page, 'W-2s').locator('.count')).toHaveText('4 files'); // last 2 each
  await expect(card(page, 'Bank Statements')).toContainText('account-summary.pdf (different folder level)');

  // Switch pay stubs to "last 1 documents": one per person.
  await card(page, 'Pay Stubs').getByLabel('Pay Stubs: what to include').selectOption('documents');
  await card(page, 'Pay Stubs').getByLabel('Pay Stubs: how many').selectOption('1');
  await expect(card(page, 'Pay Stubs').locator('.count')).toHaveText('2 files');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Rental Application - 123 Main St Apt 4B - 2026-10-04.pdf');
  await expect(page.locator('.notice.success')).toContainText('pages');

  const pdf = await readPdf(new Uint8Array(await readFile(await download.path())));
  // 1 cover + 1 cover letter + 2 stubs + 4 W-2s + 4 statements × (2 Chase or 1 Ally pages) = 14
  expect(pdf.pages).toHaveLength(14);
  expect(pdf.title).toBe('Rental Application – 123 Main St, Apt 4B');

  const cover = pdf.pages[0] ?? '';
  for (const text of ['Rental Application', '123 Main St, Apt 4B', 'Noah Example', 'anna@example.com', 'CONTENTS']) {
    expect(cover).toContain(text);
  }
  expect(cover).toMatch(/01 Cover Letter .*2/);
  expect(cover).toMatch(/02 Pay Stubs .*last 1 each .*3/);
  expect(cover).toMatch(/03 W-2s .*last 2 each .*5/);
  expect(cover).toMatch(/04 Bank Statements .*Aug 1 – Sep 30, 2026 .*9/);

  expect(pdf.pages[1]).toContain('Cover Letter');
  expect(pdf.pages[2]).toContain('Pay Stub 2026-09-30'); // Anna's subfolder sorts first
  pdf.pages.forEach((text, i) => {
    expect(text).toContain(`Page ${i + 1} of 14`);
    expect(text).toContain('For 123 Main St, Apt 4B application only');
  });
  expect(pdf.outline).toEqual(['Cover Letter', 'Pay Stubs', 'W-2s', 'Bank Statements']);
  expect(pdf.links[0]).toEqual([1, 2, 4, 8]);

  // Nothing went over the network and nothing was stored.
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookies: document.cookie,
    databases: (await indexedDB.databases?.())?.length ?? 0,
  }));
  expect(stored).toEqual({ local: 0, session: 0, cookies: '', databases: 0 });
});

test('photos become upright pages, and the size choice shrinks big photos', async ({ page }) => {
  await openApp(page);
  await chooseFolder(page, photosFolder);
  await addTile(page, 'ID');

  const results: { bytes: number; pages: { width: number; height: number }[] }[] = [];
  for (const label of ['Full quality', 'Smaller']) {
    await page.getByText(label, { exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Generate PDF' }).click();
    const bytes = await readFile(await (await downloadPromise).path());
    const pdf = await PDFDocument.load(bytes);
    results.push({ bytes: bytes.byteLength, pages: pdf.getPages().map((p) => p.getSize()) });
  }
  const [full, smaller] = results as [(typeof results)[0], (typeof results)[0]];

  for (const result of [full, smaller]) {
    expect(result.pages).toHaveLength(4); // cover + 3 photos
    expect(result.pages[1]).toEqual({ width: 612, height: 792 }); // sideways photos shown upright → portrait
    expect(result.pages[2]).toEqual({ width: 612, height: 792 });
    expect(result.pages[3]).toEqual({ width: 792, height: 612 }); // wide photo → landscape page
  }
  expect(full.bytes).toBeGreaterThan(bigPhotoBytes); // original kept byte-for-byte
  expect(smaller.bytes).toBeLessThan(full.bytes * 0.4);
});

test('cards can be reordered and removed with the keyboard', async ({ page }) => {
  await openApp(page);
  await chooseFolder(page, docsFolder);
  for (const title of ['Cover Letter', 'ID', 'Pets']) await addTile(page, title);

  const titles = () => page.locator('.packet .card-title').allTextContents();
  await card(page, 'Pets').locator('.card').focus();
  await page.keyboard.press('Alt+ArrowUp');
  expect(await titles()).toEqual(['Cover Letter', 'Pets', 'ID']);
  await expect(card(page, 'Pets').locator('.card')).toBeFocused();

  await page.keyboard.press('Delete');
  expect(await titles()).toEqual(['Cover Letter', 'ID']);
  await expect(page.getByRole('button', { name: 'Add Pets', exact: true })).toBeVisible();
});

test('explains the contact file format when it is missing', async ({ page }) => {
  await openApp(page);
  await chooseFolder(page, noContactFolder);
  const notice = page.locator('.applicants .notice');
  await expect(notice).toContainText('There’s no contact-info.txt');
  await expect(notice.locator('pre')).toContainText('Name: Noah Example');
});

test('gives clear feedback when the folder has nothing usable', async ({ page }) => {
  await openApp(page);
  await chooseFolder(page, unusableFolder);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No usable documents in “Unusable”');
  await expect(alert).toContainText('notes.txt');
});

test('names password-protected PDFs and how to fix them', async ({ page }) => {
  await openApp(page);
  await chooseFolder(page, lockedFolder);
  await addTile(page, 'Bank Statements');
  await card(page, 'Bank Statements').getByLabel('Bank Statements: what to include').selectOption('all');
  await page.getByRole('button', { name: 'Generate PDF' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('One file couldn’t be added.');
  await expect(alert).toContainText('Bank Statements/2026-09.pdf: it’s password-protected');
});
