import { PDFDict, PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
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

  it('rejects PDFs with a broken page tree up front, listing each one', async () => {
    const attempt = buildPacket(cover, [
      {
        title: 'Broken',
        description: null,
        documents: [
          { label: 'no-pages.pdf', kind: 'pdf', bytes: handWrittenPdf(['<< /Type /Catalog >>']) },
          { label: 'kids.pdf', kind: 'pdf', bytes: handWrittenPdf([CATALOG, '<< /Type /Pages /Kids 5 /Count 1 >>']) },
          {
            label: 'loop.pdf',
            kind: 'pdf',
            bytes: handWrittenPdf([
              CATALOG,
              '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
              '<< /Type /Pages /Kids [2 0 R] /Count 1 >>',
            ]),
          },
          {
            label: 'no-size.pdf',
            kind: 'pdf',
            bytes: handWrittenPdf([
              CATALOG,
              '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
              '<< /Type /Page /Parent 2 0 R >>',
            ]),
          },
          { label: 'fine.pdf', kind: 'pdf', bytes: await samplePdf('fine', []) },
        ],
      },
    ]);
    const error = (await attempt.catch((e: unknown) => e)) as UserFacingError;
    expect(error).toBeInstanceOf(UserFacingError);
    expect(error.message).toBe('4 files couldn’t be added.');
    const unreadable = 'it couldn’t be read as a PDF. Try opening it in Preview and exporting it again.';
    expect(error.details).toEqual(
      ['no-pages.pdf', 'kids.pdf', 'loop.pdf', 'no-size.pdf'].map((label) => `${label}: ${unreadable}`),
    );
  });

  it('names a file that fails while it’s being added, with how to fix it', async () => {
    const garbled = { label: 'ID/photo.jpg', kind: 'image' as const, bytes: new Uint8Array([1, 2, 3]) };
    const attempt = buildPacket(cover, [
      { title: 'ID', description: null, documents: [{ ...garbled, image: { format: 'jpg', turn: 0 } }] },
    ]);
    const error = (await attempt.catch((e: unknown) => e)) as UserFacingError;
    expect(error).toBeInstanceOf(UserFacingError);
    expect(error.message).toBe('One file couldn’t be added.');
    expect(error.details).toEqual([
      'ID/photo.jpg: the photo couldn’t be read. Try opening it in Preview and exporting it again as a JPEG.',
    ]);
  });

  it('keeps contents links and bookmarks on the right section after an empty one', async () => {
    const packet = await buildPacket(cover, [
      { title: 'First', description: null, documents: [await pdfDoc('first')] },
      { title: 'Empty', description: null, documents: [] },
      { title: 'Last', description: null, documents: [await pdfDoc('last')] },
    ]);
    const pdf = await readPdf(packet.bytes);
    expect(pdf.pages[2]).toContain('last');
    expect(pdf.links[0]).toEqual([1, 2]);
    expect(pdf.outline).toEqual(['First', 'Last']);
  });

  it('keeps links between pages of a source PDF working, without stray page copies', async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    const pages = [1, 2, 3].map((n) => {
      const page = source.addPage([612, 792]);
      page.drawText(`Lease page ${n}`, { x: 72, y: 700, font });
      return page;
    });
    const [first, second, third] = pages as [(typeof pages)[0], (typeof pages)[0], (typeof pages)[0]];
    const outside = source.context.register(source.context.obj({ Type: 'Page', MediaBox: [0, 0, 612, 792] }));
    const link = (page: typeof first, target: Record<string, unknown>) =>
      page.node.addAnnot(
        source.context.register(
          source.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 72, 200, 100], P: page.ref, ...target }),
        ),
      );
    link(first, { Dest: [third.ref, 'Fit'] });
    link(second, { A: { S: 'GoTo', D: [first.ref, 'Fit'] } });
    link(third, { Dest: [outside, 'Fit'] });

    const packet = await buildPacket(cover, [
      {
        title: 'Lease',
        description: null,
        documents: [{ label: 'lease.pdf', kind: 'pdf', bytes: await source.save() }],
      },
    ]);
    const pdf = await readPdf(packet.bytes);
    expect(pdf.pages[1]).toContain('Lease page 1');
    expect(pdf.links.slice(1)).toEqual([[3], [1], []]);

    const out = await PDFDocument.load(packet.bytes);
    const pageObjects = out.context
      .enumerateIndirectObjects()
      .filter(([, object]) => object instanceof PDFDict && object.get(PDFName.of('Type')) === PDFName.of('Page'));
    expect(pageObjects).toHaveLength(packet.pageCount);
  });
});

const CATALOG = '<< /Type /Catalog /Pages 2 0 R >>';

/** A PDF written by hand, object 1 first, to make the kinds of damage pdf-lib can't produce. */
function handWrittenPdf(objects: readonly string[]): Uint8Array {
  const body = objects.map((object, i) => `${i + 1} 0 obj\n${object}\nendobj\n`).join('');
  return new TextEncoder().encode(`%PDF-1.7\n${body}trailer\n<< /Root 1 0 R >>\n%%EOF\n`);
}
