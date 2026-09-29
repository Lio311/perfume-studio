import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createDefaultDesign } from "../../model/design.ts";
import type { Design } from "../../model/types.ts";
import { assemblyBounds, gutterFor, safeRect, type StageFrame } from "../framing.ts";
import { heroPose } from "./hero.ts";

/** 1280×800 with the side panels, top bar, and dock left outside the safe rect. */
function tradeShowFrame(): StageFrame {
  const width = 1280;
  const height = 800;
  const stageLeft = 338;
  const stageTop = 90;
  const stageWidth = 556;
  const stageHeight = 696;
  return {
    width,
    height,
    stageLeft,
    stageTop,
    stageWidth,
    stageHeight,
    gutter: gutterFor(stageWidth),
    openTop: stageTop + 36,
    openHeight: Math.max(120, stageHeight - 36 - 108),
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
        minX = Math.min(minX, (point.x * 0.5 + 0.5) * frame.width);
        maxX = Math.max(maxX, (point.x * 0.5 + 0.5) * frame.width);
        minY = Math.min(minY, (-point.y * 0.5 + 0.5) * frame.height);
        maxY = Math.max(maxY, (-point.y * 0.5 + 0.5) * frame.height);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

describe("unboxing hero frame", () => {
  it("keeps the open carton inside the stage slot for lift-off, drawer, and tube", () => {
    const frame = tradeShowFrame();
    const safe = safeRect(frame);
    const structures = ["lift-off", "drawer", "tube"] as const;
    for (const structure of structures) {
      const design = createDefaultDesign();
      design.box.structure = structure;
      if (structure === "tube") design.box.shape = { type: "cylinder" };
      const pose = heroPose(design, frame, 30);
      const bounds = assemblyBounds(design, 0, "box", true);
      const box = projected(pose, bounds, frame);
      expect(box.minX, structure).toBeGreaterThanOrEqual(safe.left - 8);
      expect(box.maxX, structure).toBeLessThanOrEqual(safe.right + 8);
      expect(box.minY, structure).toBeGreaterThanOrEqual(safe.top - 8);
      expect(box.maxY, structure).toBeLessThanOrEqual(safe.bottom + 8);
      expect(pose.position.distanceTo(pose.target), structure).toBeGreaterThan(40);
    }
  });

  it("frames an octagon lift-off in the same clear slot", () => {
    const frame = tradeShowFrame();
    const safe = safeRect(frame);
    const design: Design = createDefaultDesign();
    design.box.structure = "lift-off";
    design.box.shape = { type: "polygon", sides: 8 };
    const pose = heroPose(design, frame, 30);
    const box = projected(pose, assemblyBounds(design, 0, "box", true), frame);
    expect(box.minX).toBeGreaterThanOrEqual(safe.left - 8);
    expect(box.maxX).toBeLessThanOrEqual(safe.right + 8);
    expect(box.minY).toBeGreaterThanOrEqual(safe.top - 8);
    expect(box.maxY).toBeLessThanOrEqual(safe.bottom + 8);
  });
});
