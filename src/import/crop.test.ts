import { describe, expect, it } from "vitest";
import { dominantColor } from "./crop.ts";

function fill(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("dominantColor", () => {
  it("keeps a gold swatch when the crop is mostly paper and ink", () => {
    const data = fill(24, 24, (x, y) => {
      if (x > 16 && y < 8) return [211, 178, 107];
      if (y === 4 && x < 10) return [30, 26, 20];
      return [250, 250, 248];
    });
    const hex = dominantColor(data);
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeGreaterThan(140);
    expect(r).toBeGreaterThan(b + 40);
  });
});
