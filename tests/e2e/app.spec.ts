import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test as base, expect, type Page, type Request } from '@playwright/test';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
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

/**
 * Every test fails if anything but the app file itself is requested, by the page or
 * the PDF worker, so network access anywhere in the app is caught whatever the test does.
 */
const test = base.extend<{ staysLocal: undefined }>({
  staysLocal: [
    async ({ context }, use) => {
      const outside = new Set<Request>();
      context.on('request', (request) => {
        const url = request.url();
        if (url !== APP_URL && !/^(blob|data):/.test(url)) outside.add(request);
      });
      // Some engines report a request the policy then blocks; those never left.
      context.on('requestfailed', (request) => {
        if (/csp|content security policy/i.test(request.failure()?.errorText ?? '')) outside.delete(request);
      });
      await use(undefined);
      expect(
        [...outside].map((request) => request.url()),
        'requests for anything but the app file',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

let workspace: string;
let docsFolder: string;
let noContactFolder: string;
let unusableFolder: string;
let lockedFolder: string;
let photosFolder: string;
let statementsFolder: string;
let losslessFolder: string;
let bigPhotoBytes: number;
let grainyBytes: number;

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
      ['archive.zip', new Uint8Array([1, 2, 3])],
      ['Current Lease.pages', new Uint8Array([1, 2, 3])],
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
  // A photo-like PNG: smooth shading plus grain, which lossless formats store poorly.
  const grainyPng = await scratch.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1000;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 7;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const shade = ((i / 4) % canvas.width) / 8 + (seed % 48);
      pixels.data.set([shade, shade * 0.8, 255 - shade, 255], i);
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1] as string;
  });
  await scratch.close();
  const grainy = new Uint8Array(Buffer.from(grainyPng, 'base64'));
  grainyBytes = grainy.byteLength;
  // Pages, Word and "Save as PDF" store pictures losslessly (Flate), as pdf-lib does with a PNG.
  const exported = await PDFDocument.create();
  const exportedImage = await exported.embedPng(grainy);
  exported.addPage([612, 792]).drawImage(exportedImage, { x: 36, y: 300, width: 540, height: 338 });
  losslessFolder = join(workspace, 'Lossless');
  await writeFiles(
    losslessFolder,
    new Map([
      ['Exported ID.pdf', await exported.save()],
      ['Screenshot.png', grainy],
    ]),
  );
  const bigPlain = new Uint8Array(Buffer.from(bigPhoto, 'base64'));
  const big = withExifOrientation(bigPlain, 6);
  // A scanned ID saved as a PDF: a big photo inside, the usual reason a PDF is huge.
  const scan = await PDFDocument.create();
  const scanImage = await scan.embedJpg(bigPlain);
  scan.addPage([612, 792]).drawImage(scanImage, { x: 36, y: 200, width: 540, height: 360 });
  const scannedPdf = await scan.save();
  bigPhotoBytes = big.byteLength;
  // Statements that each carry the same big image, like a bank's logo on every page.
  const statements = new Map<string, Uint8Array>();
  for (const month of ['2026-07', '2026-08', '2026-09']) {
    const statement = await PDFDocument.create();
    const logo = await statement.embedJpg(bigPlain);
    statement.addPage([612, 792]).drawImage(logo, { x: 36, y: 600, width: 270, height: 180 });
    statements.set(`Bank Statements/${month}.pdf`, await statement.save());
  }
  statements.set('ID.jpg', big);
  statementsFolder = join(workspace, 'Statements');
  await writeFiles(statementsFolder, statements);
  photosFolder = join(workspace, 'Photos');
  await writeFiles(
    photosFolder,
    new Map([
      ['ID/a-big-sideways.jpg', big],
      ['ID/b-small-sideways.jpg', withExifOrientation(sampleIdJpeg(), 6)],
      ['ID/c-wide.jpg', sampleIdJpeg()],
      ['Scanned ID.pdf', scannedPdf],
    ]),
  );
});

test.afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

/** Opens the app on Oct 4, 2026 in New York, and records the errors it logs. */
async function openApp(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-10-04T12:00:00-04:00'));
  await page.goto(APP_URL);
  return { errors };
}

/** Globals of the sealed PDF worker that can't send or store anything, in Chromium and WebKit. */
const SAFE_WORKER_GLOBALS = new Set([
  ...['self', 'globalThis', 'constructor', 'name', 'location', 'origin', 'isSecureContext', 'crossOriginIsolated'],
  ...['postMessage', 'close', 'addEventListener', 'removeEventListener', 'dispatchEvent', 'when', 'reportError'],
  ...['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'scheduler'],
  ...['requestAnimationFrame', 'cancelAnimationFrame', 'structuredClone', 'createImageBitmap'],
  ...['atob', 'btoa', 'crypto', 'performance', 'console', 'trustedTypes'],
  ...['parseInt', 'parseFloat', 'isNaN', 'isFinite', 'escape', 'unescape'],
  ...['encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent'],
  'eval', // blocked by the policy, which has no 'unsafe-eval'
]);

/**
 * Hands the page a folder the way the folder picker does: the input's files, each with its path
 * from the folder down, then a "change" event. Playwright's own folder upload (setInputFiles)
 * stalls WebKit for tens of seconds at random on CI, an upstream bug, so only the test of the
 * real picker uses it.
 */
async function chooseFolder(page: Page, folder: string) {
  const names = await readdir(folder, { recursive: true, withFileTypes: true });
  const picked = await Promise.all(
    names
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        const relativePath = join(basename(folder), path.slice(folder.length + 1)).replaceAll('\\', '/');
        return { relativePath, base64: (await readFile(path)).toString('base64') };
      }),
  );
  await page.locator('#folder-input').evaluate((input: HTMLInputElement, files) => {
    const chosen = files.map(({ relativePath, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const file = new File([bytes], relativePath.split('/').at(-1) ?? relativePath);
      return Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
    });
    Object.defineProperty(input, 'files', { value: chosen, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    Reflect.deleteProperty(input, 'files');
  }, picked);
}
const addTile = (page: Page, title: string) => page.getByRole('button', { name: `Add ${title}`, exact: true }).click();
const card = (page: Page, title: string) =>
  page.locator('.row').filter({ has: page.locator('.card-title', { hasText: title }) });

test('says it is local-only and ships a strict no-network policy', async ({ page }) => {
  const { errors } = await openApp(page);
  await expect(page.getByRole('note')).toContainText('never connects to the internet');

  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("connect-src 'none'");
  expect(policy).not.toContain('unsafe-inline');

  // The browser itself refuses network access from the page, because of the policy
  // (not just because this machine might be offline).
  const blockedBy = await page.evaluate(async () => {
    const violation = new Promise<string>((resolve) =>
      document.addEventListener('securitypolicyviolation', (event) => resolve(event.effectiveDirective)),
    );
    const sent = await fetch('https://example.com/').then(
      () => true,
      () => false,
    );
    return sent ? 'nothing' : violation;
  });
  expect(blockedBy).toBe('connect-src');
  expect(
    errors.filter(
      (e) => !e.includes('Content Security Policy') && !e.includes('Failed to fetch') && !e.includes('example.com'),
    ),
  ).toEqual([]);
});

test('the PDF worker has no way to reach the network or storage', async ({ page }) => {
  // Hold the photo shrinking the worker asks the page for, so the worker stays alive
  // until it has been inspected.
  await page.addInitScript(() => {
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    const released = new Promise((resolve) => Object.assign(window, { releaseShrinking: resolve }));
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      void released.then(() => toBlob.apply(this, args));
    };
  });
  await openApp(page);
  await chooseFolder(page, photosFolder);
  await addTile(page, 'Scanned ID');
  await page.getByLabel('File size').selectOption({ label: 'Smaller' });
  const workerPromise = page.waitForEvent('worker');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate PDF' }).click();
  const worker = await workerPromise;

  const inside = await worker.evaluate(async () => {
    const names = new Set<string>();
    for (let scope: object = globalThis; scope !== Object.prototype; scope = Object.getPrototypeOf(scope)) {
      for (const name of Object.getOwnPropertyNames(scope)) names.add(name);
    }
    // Lower-case globals are the ways in and out (fetch, navigator, caches…). Upper-case
    // ones are classes; the few that reach out by themselves are in the seal's blocklist.
    // Event handler properties (onmessage…) can't send anything.
    const entryPoints = [...names].filter(
      (name) =>
        /^[a-z]/.test(name) && !/^on[a-z]+$/.test(name) && (globalThis as Record<string, unknown>)[name] !== undefined,
    );
    // import() is syntax, so the seal can't remove it; the policy must block it instead.
    const remoteModule = 'https://example.com/module.js';
    const imported = await import(remoteModule).then(
      () => true,
      () => false,
    );
    return { entryPoints: entryPoints.sort(), imported };
  });
  await page.evaluate(() => (window as unknown as { releaseShrinking: () => void }).releaseShrinking());
  await downloadPromise;

  expect(inside.imported).toBe(false);
  // A browser update that adds a new way out fails here, so it gets looked at before
  // the seal is trusted with it. Add a name only once it's clear it can't send or store.
  expect(inside.entryPoints.filter((name) => !SAFE_WORKER_GLOBALS.has(name))).toEqual([]);
});

test('builds a packet in the chosen order with cover, contents, links and footers', async ({ page }) => {
  test.slow(); // builds and reads back a 14-page packet
  const { errors } = await openApp(page);
  await page.getByRole('textbox', { name: 'Address' }).fill('123 Main St, Apt 4B');

  await chooseFolder(page, docsFolder);
  await expect(page.locator('.folder-status')).toHaveText('Apartment Docs');
  await expect(page.locator('#contact-help')).toHaveCount(0);
  // Cover Letter.pages has its exported PDF beside it, so nothing asks for it.
  await expect(page.getByText('Save this as a PDF')).toHaveCount(0);

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
  for (const text of [
    'October 2026',
    'Rental application for 123 Main St, Apt 4B',
    'Alex Sample',
    'jordan@example.com',
    'CONTENTS',
  ]) {
    expect(cover).toContain(text);
  }
  // No item numbers in the contents, only page numbers.
  expect(cover).toContain(
    'CONTENTS Cover Letter 2 Pay Stubs (last 1) 3 W-2s (last 2) 5 Bank Statements (last 2 months) 9',
  );

  expect(pdf.pages[1]).toContain('Cover Letter');
  expect(pdf.pages[2]).toContain('Pay Stub 2026-10-02'); // Alex's subfolder sorts first
  pdf.pages.forEach((text, i) => {
    expect(text).toContain(`Page ${i + 1} of 14`);
    expect(text).toContain('Alex Sample & Jordan Sample · Application for 123 Main St, Apt 4B · Oct 2026');
  });
  expect(pdf.outline).toEqual(['Cover Letter', 'Pay Stubs', 'W-2s', 'Bank Statements']);
  expect(pdf.links[0]).toEqual([1, 2, 4, 8]);

  // Nothing was stored (and the staysLocal fixture checks nothing went over the network).
  expect(errors).toEqual([]);
  const stored = await page.evaluate(async () => {
    const files = await navigator.storage?.getDirectory?.().then(
      async (root) => {
        const names: string[] = [];
        for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
        return names.length;
      },
      () => 0, // no private file system on this page at all
    );
    return {
      local: localStorage.length,
      session: sessionStorage.length,
      cookies: document.cookie,
      databases: (await indexedDB.databases()).length,
      caches: typeof caches === 'undefined' ? 0 : (await caches.keys()).length,
      files: files ?? 0,
    };
  });
  expect(stored).toEqual({ local: 0, session: 0, cookies: '', databases: 0, caches: 0, files: 0 });
});

test('photos become upright pages, and the size choice shrinks big photos', async ({ page }) => {
  test.slow(); // builds two packets from large photos
  await openApp(page);
  await chooseFolder(page, photosFolder);
  await addTile(page, 'ID');

  const results: { bytes: number; pages: { width: number; height: number }[] }[] = [];
  for (const label of ['High', 'Smaller']) {
    await page.getByLabel('File size').selectOption({ label });
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

test('big photos inside PDFs, like scans, are shrunk too while the page stays the same', async ({ page }) => {
  test.slow(); // builds two packets from a large scan
  await openApp(page);
  await chooseFolder(page, photosFolder);
  await addTile(page, 'Scanned ID');

  const sizes: number[] = [];
  for (const label of ['High', 'Smaller']) {
    await page.getByLabel('File size').selectOption({ label });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Generate PDF' }).click();
    const bytes = await readFile(await (await downloadPromise).path());
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPages().map((p) => p.getSize())).toEqual([
      { width: 612, height: 792 },
      { width: 612, height: 792 },
    ]);
    sizes.push(bytes.byteLength);
  }
  expect(sizes[0]).toBeGreaterThan(bigPhotoBytes); // High keeps a 3000px scan as it was
  expect(sizes[1]).toBeLessThan((sizes[0] as number) * 0.3);
});

test('repeated images are stored once, and big packets say where the size comes from', async ({ page }) => {
  test.slow(); // builds a packet from large statements and a photo
  await openApp(page);
  await chooseFolder(page, statementsFolder);
  await addTile(page, 'Bank Statements');
  await card(page, 'Bank Statements').getByLabel('Bank Statements: what to include').selectOption('all');
  await addTile(page, 'ID');
  await page.getByLabel('File size').selectOption({ label: 'High' });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate PDF' }).click();
  const bytes = await readFile(await (await downloadPromise).path());

  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5);
  expect(bytes.byteLength).toBeGreaterThan(bigPhotoBytes * 2);
  expect(bytes.byteLength).toBeLessThan(bigPhotoBytes * 2.5); // the statements' three copies are stored once
  const report = page.locator('.size-report');
  await expect(report).toContainText(/Bank Statements: [\d.]+ MB → about [\d.]+ MB/);
  await expect(report).toContainText('ID:');
  await expect(report).toContainText('Repeated images and fonts are stored once, which saved');
  await expect(report).toContainText('Good to know');
});

test('losslessly stored pictures, in PDFs and PNG files, become much smaller JPEGs', async ({ page }) => {
  test.slow(); // builds two packets from large images
  await openApp(page);
  await chooseFolder(page, losslessFolder);
  await page.getByLabel('File size').selectOption({ label: 'Smaller' });

  for (const title of ['Exported ID', 'Screenshot']) {
    await addTile(page, title);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Generate PDF' }).click();
    const bytes = await readFile(await (await downloadPromise).path());
    const pdf = await PDFDocument.load(bytes);
    const images = pdf.context
      .enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter(
        (object) => object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
      )
      .map((object) => (object as PDFRawStream).dict);
    expect(images.map((dict) => dict.get(PDFName.of('Filter')))).toEqual([PDFName.of('DCTDecode')]);
    expect(images.map((dict) => dict.get(PDFName.of('Width'))?.toString())).toEqual(['1150']);
    expect(bytes.byteLength).toBeLessThan(grainyBytes * 0.25);
    await card(page, title).locator('.card').focus();
    await page.keyboard.press('Delete');
    await expect(card(page, title)).toHaveCount(0);
  }
});

test('explains that dropping a folder isn’t supported, without leaving the page', async ({ page }) => {
  await openApp(page);
  const prevented = await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(['x'], 'statement.pdf', { type: 'application/pdf' }));
    const drop = new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true });
    document.body.dispatchEvent(drop);
    return drop.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.getByRole('alert')).toContainText('Drag and drop isn’t supported. Click “Choose folder…”');
});

test('text files become pages, and the security details link points to the repository', async ({ page }) => {
  await openApp(page);
  const details = page.getByRole('link', { name: 'Details' });
  await expect(details).toHaveAttribute('href', /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/security\/policy$/);
  await expect(details).toHaveAttribute('target', '_blank');
  await expect(details).toHaveAttribute('rel', 'noopener noreferrer');

  await chooseFolder(page, docsFolder);
  await addTile(page, 'Note to Landlord');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate PDF' }).click();
  const pdf = await readPdf(new Uint8Array(await readFile(await (await downloadPromise).path())));
  expect(pdf.pages).toHaveLength(2);
  expect(pdf.pages[1]).toContain('Thank you for considering our application.');
  expect(pdf.pages[1]).toContain('Alex & Jordan');
});

test('the real folder picker reads a whole folder, subfolders included', async ({ page, browserName }) => {
  // Playwright's folder upload stalls WebKit at random on CI (an upstream bug, not the app's),
  // so the real picker is tested in Chromium; every other test hands over the folder directly.
  test.skip(browserName === 'webkit', 'Playwright folder uploads stall WebKit at random');
  await openApp(page);
  await page.locator('#folder-input').setInputFiles(docsFolder);
  await expect(page.locator('.folder-status')).toContainText('Apartment Docs');
  for (const title of ['Bank Statements', 'Cover Letter', 'Pay Stubs', 'W-2s']) {
    await expect(page.getByRole('button', { name: `Add ${title}`, exact: true })).toBeVisible();
  }
});

test('cards can be reordered and removed with the keyboard or by dragging back', async ({ page }) => {
  await openApp(page);
  await chooseFolder(page, docsFolder);
  for (const title of ['Cover Letter', 'ID', 'Pets']) await addTile(page, title);

  const titles = page.locator('.packet .card-title');
  await card(page, 'Pets').locator('.card').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(titles).toHaveText(['Cover Letter', 'Pets', 'ID']);
  await expect(card(page, 'Pets').locator('.card')).toBeFocused();

  await page.keyboard.press('Delete');
  await expect(titles).toHaveText(['Cover Letter', 'ID']);

  // Dragging a card back up to the tiles removes it too.
  await card(page, 'ID').locator('.card').dragTo(page.locator('.pool'));
  await expect(titles).toHaveText(['Cover Letter']);
  await expect(page.getByRole('button', { name: 'Add ID', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Pets', exact: true })).toBeVisible();
});

test('explains the contact file format when it is missing', async ({ page }) => {
  await openApp(page);
  await chooseFolder(page, noContactFolder);
  const notice = page.locator('#contact-help');
  await expect(notice).toContainText('There’s no contact-info.txt');
  await expect(notice.locator('pre')).toContainText('Name: Alex Sample');
});

test('gives clear feedback when the folder has nothing usable', async ({ page }) => {
  await openApp(page);
  await chooseFolder(page, unusableFolder);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No usable documents in “Unusable”');
  await expect(alert).toContainText('archive.zip');
  await expect(alert).toContainText(
    'Current Lease.pages: save it as a PDF first (in Pages, choose File → Export To → PDF)',
  );
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

test('tiles and cards dragged over the address field carry no text to drop into it', async ({ page }) => {
  await openApp(page);
  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill('1 Elm St');
  await chooseFolder(page, docsFolder);
  await addTile(page, 'ID');
  // What the field is offered; text there would be inserted into it by some browsers.
  await address.evaluate((input) => {
    input.dataset.draggedTypes = '';
    input.addEventListener('dragover', (event) => {
      input.dataset.draggedTypes += `${(event as DragEvent).dataTransfer?.types.join(',')};`;
    });
  });

  await page.getByRole('button', { name: 'Add Cover Letter', exact: true }).dragTo(address);
  await card(page, 'ID').locator('.card').dragTo(address);
  const offered = (await address.getAttribute('data-dragged-types'))?.split(';').filter(Boolean) ?? [];
  expect(offered.length).toBeGreaterThan(0);
  expect(offered.every((types) => types === 'application/x-packet-item')).toBe(true);
  await expect(address).toHaveValue('1 Elm St');
  await expect(page.locator('.packet .card-title')).toHaveText(['ID']);
});
