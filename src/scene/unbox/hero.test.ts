import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createDefaultDesign } from "../../model/design.ts";
import type { Design } from "../../model/types.ts";
import { assemblyBounds, gutterFor, safeRect, type StageFrame } from "../framing.ts";
import { bottleHeroBounds, heroPose, widePose } from "./hero.ts";

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
  return { minX, maxX, minY, maxY, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

describe("unboxing hero frame", () => {
  it("eases from a whole closed carton to a bottle that fills the stage", () => {
    const frame = tradeShowFrame();
    const safe = safeRect(frame);
    const structures = ["lift-off", "drawer", "tube"] as const;
    for (const structure of structures) {
      const design = createDefaultDesign();
      design.box.structure = structure;
      if (structure === "tube") design.box.shape = { type: "cylinder" };
      const wide = widePose(design, frame, 30);
      const closed = projected(wide, assemblyBounds(design, 0, "box", false), frame);
      expect(closed.minX, `${structure} wide`).toBeGreaterThanOrEqual(safe.left - 4);
      expect(closed.maxX, `${structure} wide`).toBeLessThanOrEqual(safe.right + 4);
      expect(closed.minY, `${structure} wide`).toBeGreaterThanOrEqual(safe.top - 4);
      expect(closed.maxY, `${structure} wide`).toBeLessThanOrEqual(safe.bottom + 4);

      const hero = heroPose(design, frame, 30);
      const bottle = projected(hero, bottleHeroBounds(design), frame);
      const fraction = bottle.h / frame.stageHeight;
      expect(fraction, structure).toBeGreaterThanOrEqual(0.55);
      expect(fraction, structure).toBeLessThanOrEqual(0.65);
      expect(bottle.cx, structure).toBeGreaterThan(safe.left + safe.width * 0.35);
      expect(bottle.cx, structure).toBeLessThan(safe.right - safe.width * 0.35);
      expect(bottle.minY, structure).toBeGreaterThanOrEqual(safe.top - 8);
      expect(bottle.maxY, structure).toBeLessThanOrEqual(safe.bottom + 8);
      expect(hero.position.distanceTo(hero.target), structure).toBeLessThan(wide.position.distanceTo(wide.target));
    }
  });

  it("frames an octagon lift-off bottle in the same clear slot", () => {
    const frame = tradeShowFrame();
    const safe = safeRect(frame);
    const design: Design = createDefaultDesign();
    design.box.structure = "lift-off";
    design.box.shape = { type: "polygon", sides: 8 };
    const pose = heroPose(design, frame, 30);
    const box = projected(pose, bottleHeroBounds(design), frame);
    expect(box.h / frame.stageHeight).toBeGreaterThanOrEqual(0.55);
    expect(box.h / frame.stageHeight).toBeLessThanOrEqual(0.65);
    expect(box.minX).toBeGreaterThanOrEqual(safe.left - 8);
    expect(box.maxX).toBeLessThanOrEqual(safe.right + 8);
  });
});
