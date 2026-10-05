import { PDFArray, PDFDict, PDFRef, PDFStream, type PDFContext, type PDFObject } from 'pdf-lib';

/**
 * Walks everything `roots` refer to, through dictionaries, arrays and streams. `visit` is called
 * for each reference met and returns whether to follow it; it must say no to references it has
 * already followed, since PDFs can refer in loops.
 */
export function walkReferences(
  context: PDFContext,
  roots: readonly PDFObject[],
  visit: (ref: PDFRef) => boolean,
): void {
  const pending = [...roots];
  while (pending.length > 0) {
    const object = pending.pop() as PDFObject;
    if (object instanceof PDFRef) {
      const target = visit(object) ? context.lookup(object) : undefined;
      if (target) pending.push(target);
    } else if (object instanceof PDFStream) {
      pending.push(object.dict);
    } else if (object instanceof PDFDict) {
      for (const [, value] of object.entries()) pending.push(value);
    } else if (object instanceof PDFArray) {
      pending.push(...object.asArray());
    }
  }
}
