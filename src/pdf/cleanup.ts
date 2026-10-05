import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef, PDFStream, type PDFDocument, type PDFObject } from 'pdf-lib';
import { walkReferences } from './objectGraph';

/**
 * Lossless clean-up of the assembled packet, so nothing looks any different:
 *
 * - identical pieces (a bank's logo on every statement, the same fonts in every month's file)
 *   are stored once and shared;
 * - streams saved without compression are compressed;
 * - hidden page extras (thumbnails, editing data) and anything no longer referenced are dropped.
 *
 * Returns roughly how many bytes it saved.
 */
export function cleanUpPacket(doc: PDFDocument): number {
  removePageExtras(doc);
  let saved = compressUncompressedStreams(doc);
  saved += mergeDuplicates(doc);
  saved += removeUnreachable(doc);
  return saved;
}

const NAME = {
  Filter: PDFName.of('Filter'),
  DecodeParms: PDFName.of('DecodeParms'),
  Length: PDFName.of('Length'),
  Type: PDFName.of('Type'),
  Thumb: PDFName.of('Thumb'),
  PieceInfo: PDFName.of('PieceInfo'),
} as const;

/** Dictionaries that are safe to share once identical. Pages and annotations never are. */
const SHAREABLE_DICT_TYPES = new Set(['/Font', '/FontDescriptor', '/ExtGState']);
const MIN_COMPRESSIBLE_BYTES = 512;
const MAX_MERGE_PASSES = 4;

function removePageExtras(doc: PDFDocument): void {
  for (const page of doc.getPages()) {
    page.node.delete(NAME.Thumb);
    page.node.delete(NAME.PieceInfo);
  }
}

function compressUncompressedStreams(doc: PDFDocument): number {
  let saved = 0;
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || object.dict.has(NAME.Filter) || object.dict.has(NAME.DecodeParms))
      continue;
    if (object.contents.byteLength < MIN_COMPRESSIBLE_BYTES) continue;
    const compressed = doc.context.flateStream(object.contents);
    if (compressed.contents.byteLength >= object.contents.byteLength) continue;
    for (const [key, value] of object.dict.entries()) {
      if (key !== NAME.Length) compressed.dict.set(key, value);
    }
    doc.context.assign(ref, compressed);
    saved += object.contents.byteLength - compressed.contents.byteLength;
  }
  return saved;
}

/** Shares identical streams and font dictionaries, repeating until nothing more matches. */
function mergeDuplicates(doc: PDFDocument): number {
  let saved = 0;
  for (let pass = 0; pass < MAX_MERGE_PASSES; pass++) {
    const canonical = new Map<string, PDFRef>();
    const replacements = new Map<PDFRef, PDFRef>();
    for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
      const key = makeMergeKey(object);
      if (!key) continue;
      const first = canonical.get(key);
      if (first && isSameContent(doc.context.lookup(first), object)) {
        replacements.set(ref, first);
        saved += object instanceof PDFRawStream ? object.contents.byteLength : 0;
      } else if (!first) {
        canonical.set(key, ref);
      }
    }
    if (replacements.size === 0) break;
    for (const [, object] of doc.context.enumerateIndirectObjects()) replaceReferences(object, replacements);
    for (const ref of replacements.keys()) doc.context.delete(ref);
  }
  return saved;
}

function makeMergeKey(object: PDFObject): string | null {
  if (object instanceof PDFRawStream) {
    return `stream:${object.contents.byteLength}:${hashBytes(object.contents)}:${object.dict.toString()}`;
  }
  if (object instanceof PDFDict && !(object instanceof PDFStream)) {
    const type = object.get(NAME.Type);
    if (type instanceof PDFName && SHAREABLE_DICT_TYPES.has(type.toString())) return `dict:${object.toString()}`;
  }
  return null;
}

function isSameContent(a: PDFObject | undefined, b: PDFObject): boolean {
  if (a instanceof PDFRawStream && b instanceof PDFRawStream) {
    return a.dict.toString() === b.dict.toString() && areBytesEqual(a.contents, b.contents);
  }
  return a !== undefined && a.toString() === b.toString();
}

function replaceReferences(object: PDFObject, replacements: ReadonlyMap<PDFRef, PDFRef>): void {
  if (object instanceof PDFStream) {
    replaceReferences(object.dict, replacements);
  } else if (object instanceof PDFDict) {
    for (const [key, value] of object.entries()) {
      const replacement = value instanceof PDFRef ? replacements.get(value) : undefined;
      if (replacement) object.set(key, replacement);
      else replaceReferences(value, replacements);
    }
  } else if (object instanceof PDFArray) {
    for (let i = 0; i < object.size(); i++) {
      const value = object.get(i);
      const replacement = value instanceof PDFRef ? replacements.get(value) : undefined;
      if (replacement) object.set(i, replacement);
      else replaceReferences(value, replacements);
    }
  }
}

/** Deletes objects nothing points to any more, starting from the document's catalog and info. */
function removeUnreachable(doc: PDFDocument): number {
  const reachable = new Set<PDFRef>();
  const roots = [doc.context.trailerInfo.Root, doc.context.trailerInfo.Info].filter(
    (object): object is PDFObject => object !== undefined,
  );
  walkReferences(doc.context, roots, (ref) => {
    if (reachable.has(ref)) return false;
    reachable.add(ref);
    return true;
  });

  let saved = 0;
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (reachable.has(ref)) continue;
    saved += object instanceof PDFRawStream ? object.contents.byteLength : 0;
    doc.context.delete(ref);
  }
  return saved;
}

/** FNV-1a: a quick fingerprint to group candidates; equality is always checked in full. */
function hashBytes(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 0;
}

function areBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}
