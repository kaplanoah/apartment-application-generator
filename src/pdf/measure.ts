import { PDFArray, PDFDict, PDFName, PDFRef, PDFStream, type PDFDocument, type PDFObject, type PDFPage } from 'pdf-lib';

const PARENT = PDFName.of('Parent');

/**
 * Roughly how many bytes each group of pages takes up in the packet: everything
 * its pages draw with (content, images, fonts). Anything shared is counted once,
 * for the first group that uses it, so the totals add up to about the file size.
 */
export function measurePageGroups(doc: PDFDocument, groups: readonly (readonly PDFPage[])[]): number[] {
  // Links and bookmarks point at other pages; following them would count those pages too.
  const pageTree = new Set<string>();
  for (const page of doc.getPages()) {
    pageTree.add(page.ref.tag);
    for (let node = page.node.Parent(); node; node = node.Parent()) {
      const ref = doc.context.getObjectRef(node);
      if (!ref || pageTree.has(ref.tag)) break;
      pageTree.add(ref.tag);
    }
  }

  const counted = new Set<string>();
  return groups.map((pages) => {
    let bytes = 0;
    const pending: PDFObject[] = [];
    for (const page of pages) {
      if (counted.has(page.ref.tag)) continue;
      counted.add(page.ref.tag);
      bytes += page.node.sizeInBytes();
      pending.push(page.node);
    }
    while (pending.length > 0) {
      const object = pending.pop() as PDFObject;
      if (object instanceof PDFRef) {
        if (counted.has(object.tag) || pageTree.has(object.tag)) continue;
        counted.add(object.tag);
        const target = doc.context.lookup(object);
        if (!target) continue;
        bytes += target.sizeInBytes();
        pending.push(target);
      } else if (object instanceof PDFStream) {
        pending.push(object.dict);
      } else if (object instanceof PDFDict) {
        for (const [key, value] of object.entries()) if (key !== PARENT) pending.push(value);
      } else if (object instanceof PDFArray) {
        for (let i = 0; i < object.size(); i++) pending.push(object.get(i));
      }
    }
    return bytes;
  });
}
