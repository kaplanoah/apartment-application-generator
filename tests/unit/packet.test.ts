import { describe, expect, it } from 'vitest';
import { moveItem, newPacketItem, planPacket } from '../../src/core/packet';
import { footerText, joinNames, packetFileName } from '../../src/core/naming';
import { DEFAULT_SIZE_PRESET, getSizePreset, SIZE_PRESETS } from '../../src/core/sizePresets';
import { libraryOf, TODAY } from '../support/library';

const library = libraryOf([
  'Cover Letter.pdf',
  'Pay Stubs/2026-09-18.pdf',
  'Pay Stubs/2026-05-01.pdf',
  'ID/license.jpg',
  'Old Stubs/2020-01-01.pdf',
]);
const option = (title: string) => {
  const found = library.options.find((o) => o.title === title);
  if (!found) throw new Error(title);
  return found;
};

describe('planPacket', () => {
  it('resolves items in order, describing each range', () => {
    const items = [
      newPacketItem(option('Pay Stubs')),
      newPacketItem(option('Cover Letter')),
      newPacketItem(option('ID')),
    ];
    const sections = planPacket(library, items, TODAY);
    expect(sections.map((s) => [s.title, s.description, s.documents.map((d) => d.path)])).toEqual([
      ['Pay Stubs', 'last 2 months', ['2026-09-18.pdf']],
      ['Cover Letter', null, ['Cover Letter.pdf']],
      ['ID', null, ['license.jpg']],
    ]);
  });

  it('drops sections that come out empty and items that no longer exist', () => {
    const items = [newPacketItem(option('Old Stubs')), { optionId: 'Gone/', range: { kind: 'all' as const } }];
    expect(planPacket(library, items, TODAY)).toEqual([]);
  });

  it('starts new items with a sensible range', () => {
    expect(newPacketItem(option('Cover Letter')).range).toEqual({ kind: 'all' });
    expect(newPacketItem(option('Pay Stubs')).range.kind).toBe('months');
  });
});

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd'];
  it('moves down and up using positions in the original list', () => {
    expect(moveItem(list, 0, 2)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveItem(list, 0, 4)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(list, 1, 1)).toEqual(list);
    expect(moveItem(list, 1, 2)).toEqual(list);
  });
  it('ignores bad positions and never mutates the input', () => {
    expect(moveItem(list, 9, 0)).toEqual(list);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('naming', () => {
  it('builds the footer from the applicants and the address', () => {
    expect(footerText(['Alex Sample', 'Jordan Sample'], ' 123 Main St, Apt 4B ', TODAY)).toBe(
      'Alex Sample & Jordan Sample · Application for 123 Main St, Apt 4B · Oct 2026',
    );
    expect(footerText([], '1 Elm St', TODAY)).toBe('Application for 1 Elm St · Oct 2026');
    expect(footerText(['Alex Sample', ' '], '', TODAY)).toBe('Alex Sample · Rental application · Oct 2026');
  });

  it('joins names naturally', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A & B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B & C');
  });

  it('makes a safe, readable file name', () => {
    expect(packetFileName('123 Main St, Apt 4B', TODAY)).toBe(
      'Rental Application - 123 Main St Apt 4B - 2026-10-04.pdf',
    );
    expect(packetFileName('', TODAY)).toBe('Rental Application - 2026-10-04.pdf');
    expect(packetFileName('../../etc/passwd', TODAY)).toBe('Rental Application - etc passwd - 2026-10-04.pdf');
    expect(packetFileName('#4B: "Loft" <x>|y?\u0000', TODAY)).toBe('Rental Application - 4B Loft x y - 2026-10-04.pdf');
    expect(packetFileName('x'.repeat(300), TODAY).length).toBeLessThan(130);
  });
});

describe('size presets', () => {
  it('defaults to balanced and gets smaller from full to smaller', () => {
    expect(getSizePreset(DEFAULT_SIZE_PRESET).id).toBe('balanced');
    const [smaller, balanced, full] = SIZE_PRESETS;
    expect(full?.maxImageEdge).toBeNull();
    expect(smaller?.maxImageEdge).toBeLessThan(balanced?.maxImageEdge ?? 0);
    expect(smaller?.jpegQuality).toBeLessThan(balanced?.jpegQuality ?? 0);
  });
});
