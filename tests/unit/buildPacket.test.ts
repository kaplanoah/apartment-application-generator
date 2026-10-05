import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { UserFacingError } from '../../src/core/errors';
import { buildPacket, type PacketDocument } from '../../src/pdf/buildPacket';
import type { CoverDetails } from '../../src/pdf/cover';
import { prepareImageAsIs } from '../../src/pdf/images';
import { encryptedPdf, sampleIdJpeg, samplePdf, samplePng, withExifOrientation } from '../../scripts/lib/sampleDocs';
import { readPdf } from '../support/pdfText';

const cover: CoverDetails = {
  address: '123 Main St, Apt 4B',
  applicants: [
    {
      name: 'Alex Sample',
      details: [
        { label: 'Email', value: 'alex@example.com' },
        { label: 'Phone', value: '(555) 010-2481' },
      ],
    },
    { name: 'Zoë Łukasz 🙂', details: [{ label: 'Current address', value: '88 Elm St' }] },
  ],
  footerText: 'Alex Sample & Zoë · Application for 123 Main St, Apt 4B · Oct 2026',
  preparedOn: { year: 2026, month: 10, day: 4 },
};

const pdfDoc = async (label: string, pages = 1, rotate = 0): Promise<PacketDocument> => ({
  label,
  kind: 'pdf',
  bytes: await samplePdf(label, [], { pages, rotate }),
});
const imageDoc = async (label: string, bytes: Uint8Array): Promise<PacketDocument> => {
  const prepared = await prepareImageAsIs(bytes, label);
  return { label, kind: 'image', bytes: prepared.bytes, image: { format: prepared.format, turn: prepared.turn } };
};

describe('buildPacket', () => {
  it('shortens a long range note inside its parentheses', async () => {
    const packet = await buildPacket(cover, [
      {
        title: 'Employment letters',
        description: 'last 12 months through today, counting from the start of the most recent month',
        documents: [await pdfDoc('letter')],
      },
    ]);
    const front = (await readPdf(packet.bytes)).pages[0] ?? '';
    expect(front).toMatch(/\(last 12 months[^)]*…\)/);
  });

  it('builds cover, contents with page numbers, sections in order, links, bookmarks and footers', async () => {
    const progress: number[] = [];
    const packet = await buildPacket(
      cover,
      [
        { title: 'Cover Letter', description: null, documents: [await pdfDoc('Cover Letter.pdf')] },
        {
          title: 'Pay Stubs',
          description: 'last 2 months',
          documents: [await pdfDoc('stub A'), await pdfDoc('stub B', 2)],
        },
        {
          title: 'ID',
          description: null,
          documents: [
            await imageDoc('id.jpg', sampleIdJpeg()),
            await imageDoc('id.png', samplePng(30, 60, [200, 0, 0])),
          ],
        },
      ],
      { onProgress: (done) => progress.push(done) },
    );

    expect(packet.pageCount).toBe(7);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]); // one per file, then saving
    const pdf = await readPdf(packet.bytes);
    expect(pdf.pages).toHaveLength(7);
    expect(pdf.title).toBe('Rental Application – 123 Main St, Apt 4B');

    const front = pdf.pages[0] ?? '';
    for (const text of [
      'Rental application for 123 Main St, Apt 4B',
      '123 Main St, Apt 4B',
      'October 2026',
      'Alex Sample',
      'alex@example.com',
      '(555) 010-2481',
      'Zoë Lukasz ?',
      'Current address: 88 Elm St',
    ]) {
      expect(front).toContain(text);
    }
    expect(front).toMatch(/CONTENTS Cover Letter 2 Pay Stubs \(last 2 months\) 3 ID 6/);
    expect(pdf.pages[1]).toContain('Cover Letter.pdf');
    expect(pdf.pages[2]).toContain('stub A');
    expect(pdf.pages[3]).toContain('stub B');

    pdf.pages.forEach((text, i) => {
      expect(text).toContain(`Page ${i + 1} of 7`);
      expect(text).toContain('Alex Sample & Zoë · Application for 123 Main St, Apt 4B · Oct 2026');
    });
    expect(pdf.outline).toEqual(['Cover Letter', 'Pay Stubs', 'ID']);
    expect(pdf.links[0]).toEqual([1, 2, 5]);
  });

  it('places photo pages in the right orientation', async () => {
    const packet = await buildPacket(cover, [
      {
        title: 'ID',
        description: null,
        documents: [
          await imageDoc('wide.jpg', sampleIdJpeg()),
          await imageDoc('sideways.jpg', withExifOrientation(sampleIdJpeg(), 6)),
        ],
      },
    ]);
    const doc = await PDFDocument.load(packet.bytes);
    expect(doc.getPages().map((page) => page.getSize())).toEqual([
      { width: 612, height: 792 },
      { width: 792, height: 612 },
      { width: 612, height: 792 },
    ]);
  });

  it('writes footers on rotated and odd-sized pages too', async () => {
    const packet = await buildPacket({ ...cover, footerText: 'FOOTER' }, [
      {
        title: 'Odd pages',
        description: null,
        documents: [
          await pdfDoc('rotated', 1, 90),
          { label: 'tiny', kind: 'pdf', bytes: await samplePdf('tiny', [], { size: [200, 300] }) },
        ],
      },
    ]);
    const pdf = await readPdf(packet.bytes);
    expect(pdf.pages[1]).toContain('Page 2 of 3');
    expect(pdf.pages[1]).toContain('FOOTER');
    expect(pdf.pages[2]).toContain('Page 3 of 3');
  });

  it('continues the contents onto a second cover page for long packets', async () => {
    const sections = await Promise.all(
      Array.from({ length: 40 }, async (_, i) => ({
        title: `Section ${i + 1}`,
        description: null,
        documents: [await pdfDoc(`doc ${i + 1}`)],
      })),
    );
    const packet = await buildPacket(cover, sections);
    const pdf = await readPdf(packet.bytes);
    expect(pdf.pages[1]).toContain('CONTENTS (CONTINUED)');
    expect(pdf.pages[0]).toMatch(/CONTENTS Section 1 3 /); // two cover pages, so content starts on page 3
    expect(pdf.pages[2]).toContain('doc 1');
    expect(pdf.pages).toHaveLength(42);
  });

  it('works without an address, applicants or footer', async () => {
    const packet = await buildPacket({ address: '', applicants: [], footerText: '', preparedOn: cover.preparedOn }, [
      { title: 'Only', description: null, documents: [await pdfDoc('only')] },
    ]);
    const pdf = await readPdf(packet.bytes);
    expect(pdf.title).toBe('Rental Application');
    expect(pdf.pages[0]).toMatch(/^Rental Application October 2026/); // the title is the headline without an address
    expect(pdf.pages[1]).toContain('Page 2 of 2');
  });

  it('lists every unusable file at once, with how to fix it', async () => {
    const attempt = buildPacket(cover, [
      {
        title: 'Bank',
        description: null,
        documents: [
          { label: 'Bank/locked.pdf', kind: 'pdf', bytes: await encryptedPdf() },
          { label: 'Bank/broken.pdf', kind: 'pdf', bytes: new TextEncoder().encode('not a pdf') },
          { label: 'Bank/photo.jpg', kind: 'image', bytes: sampleIdJpeg() },
        ],
      },
    ]);
    await expect(attempt).rejects.toBeInstanceOf(UserFacingError);
    const error = (await attempt.catch((e: unknown) => e)) as UserFacingError;
    expect(error.message).toBe('3 files couldn’t be added.');
    expect(error.details).toEqual([
      'Bank/locked.pdf: it’s password-protected. Open it in Preview, choose File → Export as PDF, and use the exported copy.',
      'Bank/broken.pdf: it couldn’t be read as a PDF. Try opening it in Preview and exporting it again.',
      'Bank/photo.jpg: the photo wasn’t prepared.',
    ]);
  });
});
