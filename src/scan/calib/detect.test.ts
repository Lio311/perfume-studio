import { describe, expect, it } from "vitest";
import { detectCardQuad } from "./detect.ts";

function paintCard(width: number, height: number, corners: Array<[number, number]>): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = 70;
    rgba[index * 4 + 1] = 74;
    rgba[index * 4 + 2] = 78;
    rgba[index * 4 + 3] = 255;
  }
  const minY = Math.floor(Math.min(...corners.map((corner) => corner[1])));
  const maxY = Math.ceil(Math.max(...corners.map((corner) => corner[1])));
  const loop = [...corners, corners[0]];
  for (let y = Math.max(0, minY); y <= Math.min(height - 1, maxY); y += 1) {
    const hits: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const a = loop[index];
      const b = loop[index + 1];
      if (((a[1] <= y && y <= b[1]) || (b[1] <= y && y <= a[1])) && Math.abs(a[1] - b[1]) > 1e-6) {
        const t = (y - a[1]) / (b[1] - a[1]);
        hits.push(a[0] + t * (b[0] - a[0]));
      }
    }
    if (hits.length < 2) continue;
    const left = Math.max(0, Math.floor(Math.min(...hits)));
    const right = Math.min(width - 1, Math.ceil(Math.max(...hits)));
    for (let x = left; x <= right; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 236;
      rgba[offset + 1] = 232;
      rgba[offset + 2] = 220;
    }
  }
  return rgba;
}

describe("card quad detector", () => {
  it("finds a bright card and orders the corners", () => {
    const corners: Array<[number, number]> = [
      [80, 70],
      [280, 90],
      [260, 210],
      [70, 190],
    ];
    const found = detectCardQuad({ width: 360, height: 280, rgba: paintCard(360, 280, corners) });
    expect(found).not.toBeNull();
    expect(found).toHaveLength(4);
    for (let index = 0; index < 4; index += 1) {
      const match = found!.reduce((best, point) => {
        const distance = Math.hypot(point.x - corners[index][0], point.y - corners[index][1]);
        return distance < best ? distance : best;
      }, Number.POSITIVE_INFINITY);
      expect(match).toBeLessThan(14);
    }
    expect(found![0].x + found![0].y).toBeLessThan(found![2].x + found![2].y);
  });
});
