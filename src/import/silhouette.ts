export interface Silhouette {
  mask: Uint8Array;
  width: number;
  height: number;
  /** Radius samples, base → top, normalised by the widest row. */
  radii: number[];
  minY: number;
  maxY: number;
  centerX: number;
  maxHalf: number;
  color: string;
}

export function segmentSilhouette(image: ImageData, threshold: number): Silhouette {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  const corners = [0, width - 1, (height - 1) * width, width * height - 1];
  let bg = 0;
  for (const index of corners) {
    bg += data[index * 4] * 0.3 + data[index * 4 + 1] * 0.59 + data[index * 4 + 2] * 0.11;
  }
  bg /= corners.length;
  const gate = Math.max(6, threshold);
  for (let index = 0; index < width * height; index += 1) {
    const r = data[index * 4];
    const g = data[index * 4 + 1];
    const b = data[index * 4 + 2];
    const luma = r * 0.3 + g * 0.59 + b * 0.11;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    mask[index] = Math.abs(luma - bg) > gate || sat > gate * 1.35 ? 1 : 0;
  }
  const kept = largestComponent(mask, width, height);
  return profileFromMask(kept, width, height, data);
}

function largestComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const labels = new Int32Array(mask.length);
  let label = 0;
  let bestLabel = 0;
  let bestCount = 0;
  const stack: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || labels[index]) continue;
    label += 1;
    let count = 0;
    stack.push(index);
    labels[index] = label;
    while (stack.length) {
      const current = stack.pop()!;
      count += 1;
      const x = current % width;
      const y = (current - x) / width;
      const nexts: number[] = [];
      if (x > 0) nexts.push(current - 1);
      if (x < width - 1) nexts.push(current + 1);
      if (y > 0) nexts.push(current - width);
      if (y < height - 1) nexts.push(current + width);
      for (const next of nexts) {
        if (labels[next] || !mask[next]) continue;
        labels[next] = label;
        stack.push(next);
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestLabel = label;
    }
  }
  const out = new Uint8Array(mask.length);
  if (!bestLabel) return out;
  for (let index = 0; index < mask.length; index += 1) if (labels[index] === bestLabel) out[index] = 1;
  return out;
}

function profileFromMask(mask: Uint8Array, width: number, height: number, data: Uint8ClampedArray): Silhouette {
  let minY = height;
  let maxY = 0;
  let minX = width;
  let maxX = 0;
  const colors: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      if (((x + y) & 7) === 0) colors.push(data[(y * width + x) * 4], data[(y * width + x) * 4 + 1], data[(y * width + x) * 4 + 2]);
    }
  }
  if (maxY < minY) {
    return { mask, width, height, radii: [0.45, 0.5, 0.48, 0.4], minY: 0, maxY: height - 1, centerX: width / 2, maxHalf: width / 4, color: "#c4a15a" };
  }
  const samples = 42;
  const span = Math.max(1, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const raw: number[] = [];
  let maxHalf = 1;
  for (let sample = 0; sample < samples; sample += 1) {
    const y = Math.round(maxY - (sample / (samples - 1)) * span);
    let left = -1;
    let right = -1;
    const row = y * width;
    for (let x = 0; x < width; x += 1) if (mask[row + x]) { left = x; break; }
    for (let x = width - 1; x >= 0; x -= 1) if (mask[row + x]) { right = x; break; }
    const half = left < 0 ? 0 : (right - left) / 2;
    raw.push(half);
    maxHalf = Math.max(maxHalf, half);
  }
  const smooth = raw.map((value, index) => {
    const prev = raw[Math.max(0, index - 1)];
    const next = raw[Math.min(raw.length - 1, index + 1)];
    return (prev + value + next) / 3 / maxHalf;
  });
  return {
    mask,
    width,
    height,
    radii: smooth.map((value) => Math.max(0.04, Math.min(1, value))),
    minY,
    maxY,
    centerX,
    maxHalf,
    color: medianColor(colors),
  };
}

function medianColor(samples: number[]): string {
  if (samples.length < 3) return "#c4a15a";
  const count = samples.length / 3;
  const channel = (offset: number) => {
    const values = [];
    for (let index = 0; index < count; index += 1) values.push(samples[index * 3 + offset]);
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  const hex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${hex(channel(0))}${hex(channel(1))}${hex(channel(2))}`;
}

/** Drag a sample's radius. `y` is a pixel row in the source image, `x` a pixel column. */
export function editRadius(shape: Silhouette, x: number, y: number): number[] {
  const span = Math.max(1, shape.maxY - shape.minY);
  const sample = Math.round(((shape.maxY - y) / span) * (shape.radii.length - 1));
  const index = Math.max(0, Math.min(shape.radii.length - 1, sample));
  const next = shape.radii.slice();
  next[index] = Math.max(0.04, Math.min(1.15, Math.abs(x - shape.centerX) / Math.max(1, shape.maxHalf)));
  return next;
}
