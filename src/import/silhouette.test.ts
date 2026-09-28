import { describe, expect, it } from "vitest";
import { editRadius, segmentSilhouette } from "./silhouette.ts";

function imageOf(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const index = (y * width + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}

describe("segmentSilhouette", () => {
  it("revolves a gold cap silhouette into a half-profile", () => {
    const image = imageOf(80, 100, (x, y) => {
      const inside = x > 22 && x < 58 && y > 18 && y < 78 && (y > 30 || Math.abs(x - 40) < 12);
      return inside ? [198, 154, 72] : [245, 245, 242];
    });
    const shape = segmentSilhouette(image, 28);
    expect(shape.radii.length).toBeGreaterThan(8);
    expect(Math.max(...shape.radii)).toBeGreaterThan(0.7);
    expect(shape.color.toLowerCase()).toMatch(/^#[c-f]/);
    const edited = editRadius(shape, shape.centerX + shape.maxHalf * 0.4, (shape.minY + shape.maxY) / 2);
    expect(edited).toHaveLength(shape.radii.length);
  });
});