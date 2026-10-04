import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfSummary {
  readonly pages: readonly string[];
  readonly outline: readonly string[];
  /** Link annotations per page, as the 0-based page index each one jumps to. */
  readonly links: readonly (readonly number[])[];
  readonly title: string | undefined;
}

/** Reads a PDF the way a viewer would, to check what people will actually see. */
export async function readPdf(bytes: Uint8Array): Promise<PdfSummary> {
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    const links: number[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' '),
      );
      const annotations = (await page.getAnnotations()) as { subtype: string; dest?: unknown }[];
      const targets: number[] = [];
      for (const annotation of annotations) {
        if (annotation.subtype !== 'Link' || !Array.isArray(annotation.dest)) continue;
        targets.push(await doc.getPageIndex(annotation.dest[0] as never));
      }
      links.push(targets);
    }
    const outline = ((await doc.getOutline()) ?? []).map((item) => item.title);
    const metadata = (await doc.getMetadata()).info as { Title?: string };
    return { pages, outline, links, title: metadata.Title };
  } finally {
    await task.destroy();
  }
}
