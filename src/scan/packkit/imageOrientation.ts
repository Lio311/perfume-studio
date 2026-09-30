import type { CameraIntrinsics } from "./poseMath.ts";
import type { Vec2 } from "./vec.ts";

/**
 * How a camera buffer is rotated relative to the upright image the intrinsics describe.
 * `right` is the iPhone back camera in a portrait page: a landscape sensor buffer that
 * has to be turned 90° clockwise before it shares a coordinate system with those intrinsics.
 * Treating that buffer as `up` (a vertical flip of the sensor) puts the principal point
 * on the wrong axis.
 */
export type CaptureOrientation = "up" | "down" | "left" | "right";

export function safariCaptureOrientation(input: {
  bufferWidth: number;
  bufferHeight: number;
  screenWidth: number;
  screenHeight: number;
  userAgent: string;
}): CaptureOrientation {
  const ios = /iPhone|iPad|iPod/.test(input.userAgent);
  const portraitPage = input.screenHeight > input.screenWidth;
  const landscapeBuffer = input.bufferWidth > input.bufferHeight;
  if (ios && portraitPage && landscapeBuffer) return "right";
  return "up";
}

/** Buffer pixel → upright pixel. `right` is 90° clockwise, not a Y flip. */
export function uprightPixel(point: Vec2, orientation: CaptureOrientation, bufferWidth: number, bufferHeight: number): Vec2 {
  switch (orientation) {
    case "up":
      return { x: point.x, y: point.y };
    case "down":
      return { x: bufferWidth - 1 - point.x, y: bufferHeight - 1 - point.y };
    case "left":
      return { x: point.y, y: bufferWidth - 1 - point.x };
    case "right":
      return { x: bufferHeight - 1 - point.y, y: point.x };
  }
}

/** Intrinsics that describe the upright image produced by `uprightPixel` / `orientRgba`. */
export function uprightIntrinsics(
  intrinsics: CameraIntrinsics,
  orientation: CaptureOrientation,
  bufferWidth: number,
  bufferHeight: number,
): { intrinsics: CameraIntrinsics; width: number; height: number } {
  switch (orientation) {
    case "up":
      return { intrinsics, width: bufferWidth, height: bufferHeight };
    case "down":
      return {
        intrinsics: {
          fx: intrinsics.fx,
          fy: intrinsics.fy,
          cx: bufferWidth - 1 - intrinsics.cx,
          cy: bufferHeight - 1 - intrinsics.cy,
        },
        width: bufferWidth,
        height: bufferHeight,
      };
    case "left":
      return {
        intrinsics: {
          fx: intrinsics.fy,
          fy: intrinsics.fx,
          cx: intrinsics.cy,
          cy: bufferWidth - 1 - intrinsics.cx,
        },
        width: bufferHeight,
        height: bufferWidth,
      };
    case "right":
      return {
        intrinsics: {
          fx: intrinsics.fy,
          fy: intrinsics.fx,
          cx: bufferHeight - 1 - intrinsics.cy,
          cy: intrinsics.cx,
        },
        width: bufferHeight,
        height: bufferWidth,
      };
  }
}

export function orientRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  orientation: CaptureOrientation,
): { rgba: Uint8ClampedArray; width: number; height: number } {
  if (orientation === "up" || width < 1 || height < 1) return { rgba, width, height };
  const turned = orientation === "left" || orientation === "right";
  const destWidth = turned ? height : width;
  const destHeight = turned ? width : height;
  const out = new Uint8ClampedArray(destWidth * destHeight * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = uprightPixel({ x, y }, orientation, width, height);
      const dx = pixel.x;
      const dy = pixel.y;
      const source = (y * width + x) * 4;
      const dest = (dy * destWidth + dx) * 4;
      out[dest] = rgba[source];
      out[dest + 1] = rgba[source + 1];
      out[dest + 2] = rgba[source + 2];
      out[dest + 3] = rgba[source + 3];
    }
  }
  return { rgba: out, width: destWidth, height: destHeight };
}

/**
 * Vision-normalised (origin lower-left of the oriented image) → sensor pixels.
 * Port of `CapturedImageSpace.pixel`. The `.right` case is not the `.up` Y flip.
 */
export function pixelFromVisionNormalized(
  point: Vec2,
  orientation: CaptureOrientation | "upMirrored" | "downMirrored" | "leftMirrored" | "rightMirrored",
  width: number,
  height: number,
): Vec2 {
  const x = point.x;
  const y = point.y;
  switch (orientation) {
    case "up":
      return { x: x * width, y: (1 - y) * height };
    case "down":
      return { x: (1 - x) * width, y: y * height };
    case "left":
      return { x: y * width, y: x * height };
    case "right":
      return { x: (1 - y) * width, y: (1 - x) * height };
    case "upMirrored":
      return { x: (1 - x) * width, y: (1 - y) * height };
    case "downMirrored":
      return { x: x * width, y: y * height };
    case "leftMirrored":
      return { x: y * width, y: (1 - x) * height };
    case "rightMirrored":
      return { x: (1 - y) * width, y: x * height };
  }
}

export function visionNormalizedFromPixel(
  point: Vec2,
  orientation: CaptureOrientation | "upMirrored" | "downMirrored" | "leftMirrored" | "rightMirrored",
  width: number,
  height: number,
): Vec2 {
  const x = width > 0 ? point.x / width : 0;
  const y = height > 0 ? point.y / height : 0;
  switch (orientation) {
    case "up":
      return { x, y: 1 - y };
    case "down":
      return { x: 1 - x, y };
    case "left":
      return { x: y, y: x };
    case "right":
      return { x: 1 - y, y: 1 - x };
    case "upMirrored":
      return { x: 1 - x, y: 1 - y };
    case "downMirrored":
      return { x, y };
    case "leftMirrored":
      return { x: 1 - y, y: x };
    case "rightMirrored":
      return { x: y, y: 1 - x };
  }
}
