import { describe, expect, it } from 'vitest';
import { fitImage, normalizeQuarterTurn, pageSizeForImage, visibleSize, visibleToPage } from '../../src/pdf/geometry';

describe('page geometry', () => {
  const box = { x: 10, y: 20, width: 600, height: 800 };

  it('normalizes rotations', () => {
    expect(normalizeQuarterTurn(-90)).toBe(270);
    expect(normalizeQuarterTurn(450)).toBe(90);
    expect(normalizeQuarterTurn(360)).toBe(0);
  });

  it('swaps width and height for sideways pages', () => {
    expect(visibleSize(box, 0)).toEqual({ width: 600, height: 800 });
    expect(visibleSize(box, 90)).toEqual({ width: 800, height: 600 });
  });

  it('maps the visible bottom-left corner for every rotation', () => {
    // The visible bottom-left corner of a page rotated clockwise by /Rotate:
    expect(visibleToPage(box, 0, 0, 0)).toEqual({ x: 10, y: 20, rotate: 0 });
    expect(visibleToPage(box, 90, 0, 0)).toEqual({ x: 610, y: 20, rotate: 90 });
    expect(visibleToPage(box, 180, 0, 0)).toEqual({ x: 610, y: 820, rotate: 180 });
    expect(visibleToPage(box, 270, 0, 0)).toEqual({ x: 10, y: 820, rotate: 270 });
    // Moving right along the visible bottom edge:
    expect(visibleToPage(box, 90, 100, 20)).toEqual({ x: 590, y: 120, rotate: 90 });
    expect(visibleToPage(box, 270, 100, 20)).toEqual({ x: 30, y: 720, rotate: 270 });
  });

  it('fits images centered without distortion', () => {
    const area = { x: 0, y: 0, width: 100, height: 100 };
    expect(fitImage(200, 100, 0, area)).toEqual({ x: 0, y: 25, rotate: 0, width: 100, height: 50 });
  });

  it('turns sideways photos upright, staying inside the area', () => {
    const area = { x: 0, y: 0, width: 100, height: 200 };
    // A 200×100 photo that must turn 90° clockwise shows as 100×200.
    const quarter = fitImage(200, 100, 90, area);
    expect(quarter).toEqual({ x: 0, y: 200, rotate: -90, width: 200, height: 100 });
    const threeQuarter = fitImage(200, 100, 270, area);
    expect(threeQuarter).toEqual({ x: 100, y: 0, rotate: 90, width: 200, height: 100 });
    const half = fitImage(100, 50, 180, { x: 0, y: 0, width: 100, height: 50 });
    expect(half).toEqual({ x: 100, y: 50, rotate: 180, width: 100, height: 50 });
  });

  it('chooses page orientation from how the photo is shown', () => {
    expect(pageSizeForImage(400, 300, 0)).toEqual({ width: 792, height: 612 });
    expect(pageSizeForImage(400, 300, 90)).toEqual({ width: 612, height: 792 });
    expect(pageSizeForImage(300, 400, 0)).toEqual({ width: 612, height: 792 });
  });
});
