import { describe, expect, it } from 'vitest';
import { UserFacingError } from '../../src/core/errors';
import { orientationToTurn, readJpegOrientation } from '../../src/pdf/exif';
import { prepareImageAsIs, sniffImageFormat, tryUseAsIs } from '../../src/pdf/images';
import { sampleIdJpeg, samplePng, withExifOrientation } from '../../scripts/lib/sampleDocs';

describe('EXIF orientation', () => {
  const jpeg = sampleIdJpeg();

  it('reads big- and little-endian orientation tags', () => {
    expect(readJpegOrientation(jpeg)).toBe(1);
    expect(readJpegOrientation(withExifOrientation(jpeg, 6))).toBe(6);
    expect(readJpegOrientation(withExifOrientation(jpeg, 8, true))).toBe(8);
  });

  it('never throws on malformed or hostile input', () => {
    const inputs = [
      new Uint8Array(),
      new Uint8Array([0xff]),
      new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]),
      new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01]),
      withExifOrientation(jpeg, 6).slice(0, 30),
      samplePng(2, 2, [0, 0, 0]),
    ];
    for (const input of inputs) expect(readJpegOrientation(input)).toBe(1);
    // Random corruption of the EXIF block
    const tagged = withExifOrientation(jpeg, 6);
    for (let i = 4; i < 40; i++) {
      const copy = tagged.slice();
      copy[i] = 0xff;
      expect(() => readJpegOrientation(copy)).not.toThrow();
    }
  });

  it('maps orientations to clockwise turns, refusing mirrored ones', () => {
    expect([1, 3, 6, 8].map(orientationToTurn)).toEqual([0, 180, 90, 270]);
    expect([2, 4, 5, 7, 0, 9].map(orientationToTurn)).toEqual([null, null, null, null, null, null]);
  });
});

describe('image preparation', () => {
  it('identifies formats by content, not name', () => {
    expect(sniffImageFormat(sampleIdJpeg())).toBe('jpg');
    expect(sniffImageFormat(samplePng(1, 1, [1, 2, 3]))).toBe('png');
    expect(sniffImageFormat(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
  });

  it('uses JPEG and PNG as they are, carrying the EXIF turn', () => {
    expect(tryUseAsIs(withExifOrientation(sampleIdJpeg(), 6))?.turn).toBe(90);
    expect(tryUseAsIs(samplePng(1, 1, [1, 2, 3]))?.format).toBe('png');
    expect(tryUseAsIs(withExifOrientation(sampleIdJpeg(), 5))).toBeNull();
  });

  it('explains photos it cannot handle', async () => {
    await expect(prepareImageAsIs(new Uint8Array([1, 2, 3]), 'ID/photo.heic')).rejects.toBeInstanceOf(UserFacingError);
  });
});
