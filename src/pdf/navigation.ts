import { PDFHexString, PDFName, type PDFDocument, type PDFPage, type PDFRef } from 'pdf-lib';
import type { Box } from './geometry';

/** Makes a rectangle on `page` a link that jumps to `target`. */
export function addPageLink(doc: PDFDocument, page: PDFPage, rect: Box, target: PDFPage): void {
  const annotation = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    Border: [0, 0, 0],
    Dest: [target.ref, 'Fit'],
  });
  page.node.addAnnot(doc.context.register(annotation));
}

export interface OutlineItem {
  readonly title: string;
  readonly page: PDFPage;
}

/** Adds a flat list of bookmarks (the sidebar outline in Preview/Acrobat). */
export function addOutline(doc: PDFDocument, items: readonly OutlineItem[]): void {
  if (items.length === 0) return;
  const outlineRef = doc.context.nextRef();
  const refs: PDFRef[] = items.map(() => doc.context.nextRef());

  items.forEach((item, i) => {
    const previous = refs[i - 1];
    const next = refs[i + 1];
    const entry = doc.context.obj({
      Title: PDFHexString.fromText(item.title),
      Parent: outlineRef,
      Dest: [item.page.ref, 'Fit'],
      ...(previous ? { Prev: previous } : {}),
      ...(next ? { Next: next } : {}),
    });
    doc.context.assign(refs[i] as PDFRef, entry);
  });

  doc.context.assign(
    outlineRef,
    doc.context.obj({
      Type: 'Outlines',
      First: refs[0] as PDFRef,
      Last: refs[refs.length - 1] as PDFRef,
      Count: refs.length,
    }),
  );
  doc.catalog.set(PDFName.of('Outlines'), outlineRef);
}
