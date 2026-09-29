export interface Silhouette {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export interface MaskRow {
  y: number;
  left: number;
  right: number;
}

export function silhouette(width: number, height: number, pixels: Uint8Array): Silhouette {
  return { width, height, pixels };
}

export function silhouetteValid(mask: Silhouette): boolean {
  return mask.width > 0 && mask.height > 0 && mask.pixels.length === mask.width * mask.height;
}

export function rowsOf(mask: Silhouette): MaskRow[] {
  if (!silhouetteValid(mask)) return [];
  const found: MaskRow[] = [];
  for (let y = 0; y < mask.height; y += 1) {
    const start = y * mask.width;
    let left = -1;
    let right = -1;
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.pixels[start + x] === 0) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left >= 0) found.push({ y, left, right });
  }
  return found;
}
