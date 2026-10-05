import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRef,
  type PDFContext,
  type PDFDocument,
  type PDFPage,
} from 'pdf-lib';

const NAME = {
  P: PDFName.of('P'),
  Dest: PDFName.of('Dest'),
  A: PDFName.of('A'),
  S: PDFName.of('S'),
  GoTo: PDFName.of('GoTo'),
  D: PDFName.of('D'),
} as const;

/**
 * Readies a PDF's links between its own pages for copying its pages into the packet.
 *
 * pdf-lib's copyPages copies everything a page refers to. A link to another page, or an
 * annotation's /P naming its own page, would copy that page a second time outside the page
 * tree, and the link would lead to that stray copy. So each link's target page is swapped for
 * its page index (put back by reattachPageLinks), the optional /P is dropped, and a link to
 * something that isn't one of the document's pages is removed.
 */
export function detachPageLinks(source: PDFDocument): void {
  const pages = source.getPages();
  const indexes = new Map(pages.map((page, index) => [page.ref, index]));
  for (const page of pages) {
    for (const annotation of listAnnotations(page)) {
      annotation.delete(NAME.P);
      const destination = findDestination(source.context, annotation);
      const target = destination?.get(0);
      if (!destination || !(target instanceof PDFRef)) continue;
      const index = indexes.get(target);
      if (index === undefined) removeDestination(annotation);
      else destination.set(0, PDFNumber.of(index));
    }
  }
}

/** Points the links readied by detachPageLinks at the copied pages, given in the source's order. */
export function reattachPageLinks(pages: readonly PDFPage[]): void {
  for (const page of pages) {
    for (const annotation of listAnnotations(page)) {
      const destination = findDestination(page.doc.context, annotation);
      const target = destination?.get(0);
      if (!destination || !(target instanceof PDFNumber)) continue;
      const copy = pages[target.asNumber()];
      if (copy) destination.set(0, copy.ref);
      else removeDestination(annotation);
    }
  }
}

function listAnnotations(page: PDFPage): PDFDict[] {
  const annotations = page.node.Annots()?.asArray() ?? [];
  return annotations
    .map((item) => page.doc.context.lookup(item))
    .filter((item): item is PDFDict => item instanceof PDFDict);
}

/** Finds the page destination of a link, given directly or by a go-to action, if it has one. */
function findDestination(context: PDFContext, annotation: PDFDict): PDFArray | undefined {
  const destination = context.lookup(annotation.get(NAME.Dest));
  if (destination instanceof PDFArray) return destination;
  const action = context.lookup(annotation.get(NAME.A));
  if (!(action instanceof PDFDict) || context.lookup(action.get(NAME.S)) !== NAME.GoTo) return undefined;
  const target = context.lookup(action.get(NAME.D));
  return target instanceof PDFArray ? target : undefined;
}

function removeDestination(annotation: PDFDict): void {
  annotation.delete(NAME.Dest);
  annotation.delete(NAME.A);
}
