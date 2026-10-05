import { describe, expect, it } from 'vitest';
import { chooseCanvasShrinkFactor, MAX_CANVAS_PIXELS, toRgbaPixels } from '../../src/browser/imagePreparer';

describe('chooseCanvasShrinkFactor', () => {
  it('keeps images that fit on an iPhone or iPad canvas at full size', () => {
    expect(MAX_CANVAS_PIXELS).toBe(4096 * 4096);
    expect(chooseCanvasShrinkFactor(4096, 4096)).toBe(1);
    expect(chooseCanvasShrinkFactor(1, MAX_CANVAS_PIXELS)).toBe(1);
  });

  it('shrinks bigger images by just enough to fit', () => {
    expect(chooseCanvasShrinkFactor(4097, 4096)).toBe(2);
    expect(chooseCanvasShrinkFactor(8000, 6000)).toBe(2); // 48 MP → 12 MP
    expect(chooseCanvasShrinkFactor(10_000, 5_000)).toBe(2);
    expect(chooseCanvasShrinkFactor(12_000, 12_000)).toBe(3);
    for (const [width, height] of [
      [7072, 7072],
      [50_000, 1000],
      [9000, 5555],
    ] as const) {
      const factor = chooseCanvasShrinkFactor(width, height);
      expect(Math.ceil(width / factor) * Math.ceil(height / factor)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
      expect(Math.ceil(width / (factor - 1)) * Math.ceil(height / (factor - 1))).toBeGreaterThan(MAX_CANVAS_PIXELS);
    }
  });
});

describe('toRgbaPixels', () => {
  it('copies gray and RGB samples as they are when not shrinking', () => {
    const gray = toRgbaPixels(
      { kind: 'pixels', width: 2, height: 1, channels: 1, bytes: new Uint8Array([10, 200]) },
      1,
    );
    expect(gray).toEqual({ width: 2, height: 1, rgba: new Uint8ClampedArray([10, 10, 10, 255, 200, 200, 200, 255]) });
    const rgb = toRgbaPixels({ kind: 'pixels', width: 1, height: 1, channels: 3, bytes: new Uint8Array([1, 2, 3]) }, 1);
    expect(Array.from(rgb.rgba)).toEqual([1, 2, 3, 255]);
  });

  it('averages blocks of pixels, including the smaller ones at the edges', () => {
    // 3 × 2 RGB: a 2 × 2 block on the left and a 1 × 2 column on the right.
    const bytes = new Uint8Array([
      ...[0, 0, 0],
      ...[100, 0, 40],
      ...[9, 9, 9],
      ...[100, 200, 40],
      ...[0, 200, 0],
      ...[11, 11, 11],
    ]);
    const shrunk = toRgbaPixels({ kind: 'pixels', width: 3, height: 2, channels: 3, bytes }, 2);
    expect(shrunk.width).toBe(2);
    expect(shrunk.height).toBe(1);
    expect(Array.from(shrunk.rgba)).toEqual([50, 100, 20, 255, 10, 10, 10, 255]);
  });
});
