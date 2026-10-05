import type { LibraryOption } from '../core/library';

/**
 * Small filled icons: a manila folder for folders, a red page for documents
 * and a red photo for pictures. Built as SVG elements (no markup strings);
 * colors come from CSS classes.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

type IconName = 'folder' | 'document' | 'photo' | 'lock';

const SHAPES: Readonly<Record<IconName, readonly (readonly [tag: string, attrs: Record<string, string>])[]>> = {
  folder: [
    [
      'path',
      {
        class: 'shape-folder',
        d: 'M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z',
      },
    ],
  ],
  document: [
    [
      'path',
      { class: 'shape-file', d: 'M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z' },
    ],
    ['path', { class: 'shape-cut', d: 'M14 3v3.5A1.5 1.5 0 0 0 15.5 8H19z' }],
    ['path', { class: 'shape-line', d: 'M8.5 12.5h7M8.5 16h5' }],
  ],
  photo: [
    ['rect', { class: 'shape-file', x: '3.5', y: '5', width: '17', height: '14', rx: '2.5' }],
    ['circle', { class: 'shape-cut', cx: '9', cy: '10', r: '1.7' }],
    ['path', { class: 'shape-cut', d: 'M4 17.5l5-4.5 3.5 3 3-2.5 4 3.5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-1.5z' }],
  ],
  lock: [
    ['rect', { class: 'shape-stroke', x: '4.5', y: '10.5', width: '15', height: '10', rx: '2.5' }],
    ['path', { class: 'shape-stroke', d: 'M8 10.5V7.5a4 4 0 0 1 8 0v3' }],
  ],
};

export function icon(name: IconName, label?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon icon-${name}`);
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const [tag, attrs] of SHAPES[name]) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}

/** The icon that tells a folder, a document and a photo apart. */
export function optionIcon(option: LibraryOption<unknown>): SVGSVGElement {
  if (option.kind === 'folder') return icon('folder', 'Folder');
  return option.document.kind === 'image' ? icon('photo', 'Photo') : icon('document', 'Document');
}
