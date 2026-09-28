import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyVariant, createDefaultDesign } from "../model/design.ts";
import type { PartKey } from "../model/types.ts";
import { assemblyBounds, FOCUS_FILL, fitPose, orbitLimits, partBounds, safeRect, type StageFrame } from "./framing.ts";

function macbook(): StageFrame {
  const stageLeft = 338;
  const stageTop = 90;
  const stageWidth = 716;
  const stageHeight = 784;
  return {
    width: 1440,
    height: 900,
    stageLeft,
    stageTop,
    stageWidth,
    stageHeight,
    gutter: 96,
    openTop: stageTop + 28,
    openHeight: stageHeight - 28 - 76,
  };
}

function projected(pose: { position: THREE.Vector3; target: THREE.Vector3 }, bounds: THREE.Box3, frame: StageFrame) {
  const camera = new THREE.PerspectiveCamera(30, frame.width / frame.height, 0.4, 8000);
  camera.position.copy(pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld();
  const point = new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const { min, max } = bounds;
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        point.set(x, y, z).project(camera);
        const sx = (point.x * 0.5 + 0.5) * frame.width;
        const sy = (-point.y * 0.5 + 0.5) * frame.height;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
    }
  }
  return { minX, maxX, minY, maxY, h: maxY - minY, w: maxX - minX };
}

describe("focus framing on a MacBook stage", () => {
  it("fits a flacon and a cap inside the open stage without a close-up crop", () => {
    const frame = macbook();
    const safe = safeRect(frame);
    const design = createDefaultDesign();
    applyVariant(design, "bottle", "flacon-30");
    for (const part of ["bottle", "cap"] as PartKey[]) {
      const bounds = partBounds(design, 0.25, part, "bottle", false);
      const pose = fitPose(bounds, new THREE.Vector3(0.78, 0.22, 1), 30, frame, FOCUS_FILL);
      const box = projected(pose, bounds, frame);
      expect(box.minX, part).toBeGreaterThanOrEqual(safe.left - 2);
      expect(box.maxX, part).toBeLessThanOrEqual(safe.right + 2);
      expect(box.minY, part).toBeGreaterThanOrEqual(safe.top - 2);
      expect(box.maxY, part).toBeLessThanOrEqual(safe.bottom + 2);
      const ratio = box.h / safe.height;
      expect(ratio, part).toBeLessThanOrEqual(0.72);
      expect(ratio, part).toBeGreaterThan(0.5);
      const dist = pose.position.distanceTo(pose.target);
      const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
      expect(dist, part).toBeGreaterThan(radius * 1.1);
    }
  });

  it("keeps a capped bottle inside the open stage at a normal viewport", () => {
    const frame = macbook();
    const safe = safeRect(frame);
    const design = createDefaultDesign();
    design.cap.visible = true;
    design.collar.visible = true;
    design.pump.visible = true;
    design.label.visible = true;
    for (const dir of [new THREE.Vector3(0.78, 0.22, 1), new THREE.Vector3(0.02, 0.3, 1)]) {
      const bounds = assemblyBounds(design, 0, "bottle", false);
      const pose = fitPose(bounds, dir.normalize(), 30, frame);
      const box = projected(pose, bounds, frame);
      expect(box.minY, dir.y.toFixed(2)).toBeGreaterThanOrEqual(safe.top - 2);
      expect(box.maxY, dir.y.toFixed(2)).toBeLessThanOrEqual(safe.bottom + 2);
      expect(box.minX, dir.y.toFixed(2)).toBeGreaterThanOrEqual(safe.left - 2);
      expect(box.maxX, dir.y.toFixed(2)).toBeLessThanOrEqual(safe.right + 2);
    }
  });

  it("keeps the camera outside the bottle and short of the world edge", () => {
    const limits = orbitLimits(48, 30);
    expect(limits.min).toBeGreaterThan(48 * 2);
    expect(limits.max).toBeGreaterThan(limits.min);
    expect(limits.max).toBeLessThan(48 * 20);
    expect(limits.near).toBeLessThan(limits.min);
  });
});
