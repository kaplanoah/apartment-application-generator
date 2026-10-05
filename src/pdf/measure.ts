import type { PDFDocument, PDFPage, PDFRef } from 'pdf-lib';
import { walkReferences } from './objectGraph';

/**
 * Roughly how many bytes each group of pages takes up in the packet: everything
 * its pages draw with (content, images, fonts). Anything shared is counted once,
 * for the first group that uses it, so the totals add up to about the file size.
 */
export function measurePageGroups(doc: PDFDocument, groups: readonly (readonly PDFPage[])[]): number[] {
  // Links and bookmarks point at other pages; following them would count those pages too.
  const pageTree = new Set<PDFRef>();
  for (const page of doc.getPages()) {
    pageTree.add(page.ref);
    for (let node = page.node.Parent(); node; node = node.Parent()) {
      const ref = doc.context.getObjectRef(node);
      if (!ref || pageTree.has(ref)) break;
      pageTree.add(ref);
    }
  }

  const counted = new Set<PDFRef>();
  return groups.map((pages) => {
    let bytes = 0;
    const roots = pages.filter((page) => !counted.has(page.ref));
    for (const page of roots) {
      counted.add(page.ref);
      bytes += page.node.sizeInBytes();
    }
    walkReferences(
      doc.context,
      roots.map((page) => page.node),
      (ref) => {
        if (counted.has(ref) || pageTree.has(ref)) return false;
        counted.add(ref);
        bytes += doc.context.lookup(ref)?.sizeInBytes() ?? 0;
        return true;
      },
    );
    return bytes;
  });
}
