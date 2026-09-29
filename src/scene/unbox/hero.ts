import * as THREE from "three";
import { closureById } from "../../model/closures/registry.ts";
import { closureDims } from "../../model/closures/types.ts";
import { CARTON_MARK_MAX_H } from "../../geometry/logos.ts";
import { liftOpeningRim } from "../../model/closures/lift-off.ts";
import { tubeBaseHeight } from "../../model/closures/tube.ts";
import type { ClosureDims } from "../../model/closures/types.ts";
import { computeFit } from "../../model/fit.ts";
import type { Design } from "../../model/types.ts";
import { drawerTrayFront } from "../closures/build/drawer.tsx";
import { assemblyBounds, fitPose, safeRect, type StageFrame } from "../framing.ts";
import { clampPolarOffset } from "../orbitGlide.ts";
import { revealRiseMm } from "../trayLift.ts";

/** Wide closed shot. The whole carton sits in the stage, including the lid. */
const WIDE_DIR = new THREE.Vector3(0.16, 0.4, 1).normalize();
/** Close hero, nearly frontal so a drawer reads as a straight slide. */
const HERO_DIR = new THREE.Vector3(0.1, 0.22, 1).normalize();

const WIDE_FILL = 0.58;
/** Bottle height as a fraction of the stage slot. */
const HERO_STAGE = 0.6;

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

function polarOnly(pose: CameraPose): CameraPose {
  const target = pose.target.clone();
  target.y = Math.max(6, target.y);
  const offset = pose.position.clone().sub(target);
  const len = Math.max(1, offset.length());
  clampPolarOffset(offset, len);
  return { position: target.clone().add(offset), target };
}

/** Closed carton, fitted into the stage slot with air around the lid. */
export function widePose(design: Design, frame: StageFrame, fov = 30): CameraPose {
  const bounds = assemblyBounds(design, 0, "box", false);
  return polarOnly(fitPose(bounds, WIDE_DIR, fov, frame, WIDE_FILL, 0.7));
}

/**
 * Bottom of the brand on the carton that stays in the hero.
 * The lid and the tube sleeve take their marks with them, so those are omitted.
 */
function baseMarkBottom(design: Design, dims: ClosureDims, structure: string): number | null {
  const half = CARTON_MARK_MAX_H / 2;
  if (structure === "drawer") {
    return drawerTrayFront(dims.h, dims.wall).trayH * 0.58 - half;
  }
  if (structure !== "lift-off") return null;
  const fullTelescope = dims.neckH <= 0 && dims.lidH >= dims.h * 0.9;
  if (fullTelescope) return null;
  const shape = design.box.shape?.type;
  const center = shape === "polygon" || shape === "cylinder" ? dims.baseH * 0.55 : dims.baseH * 0.48;
  return center - half;
}

/** Glass plus cap, after the open rise, in world millimetres. Includes the base mark. */
export function bottleHeroBounds(design: Design): THREE.Box3 {
  const fit = computeFit(design, false);
  const structure = design.box.structure ?? "lift-off";
  const spec = closureById(structure) ?? closureById("lift-off");
  const dims = spec
    ? closureDims(
      { w: fit.boxW, h: fit.boxH, d: fit.boxD, boardMm: fit.boardMm },
      spec,
      { variant: design.box.liftOff?.variant, neckMm: design.box.liftOff?.neckMm, lidDepthMm: design.box.liftOff?.lidDepthMm },
    )
    : null;
  let rim = dims?.baseH ?? fit.boxH * 0.62;
  if (dims && structure === "drawer") {
    const front = drawerTrayFront(dims.h, dims.wall);
    rim = front.y + front.trayH;
  } else if (dims && structure === "tube") rim = tubeBaseHeight(dims);
  else if (dims && structure === "lift-off") rim = liftOpeningRim(dims);
  const rise = revealRiseMm(rim, fit.bottleH, 1, 0, fit.seatY);
  const z = structure === "drawer" ? fit.boxD * 0.92 : 0;
  const markBottom = dims ? baseMarkBottom(design, dims, structure) : null;
  const bottom = markBottom == null ? rise + fit.seatY : Math.min(rise + fit.seatY, markBottom);
  const top = bottom + Math.max(fit.bottleH + fit.capH * 0.85, fit.capBottom + fit.capH);
  const hx = Math.max(8, fit.bottleW * 0.5);
  const hz = Math.max(8, fit.bottleD * 0.5);
  return new THREE.Box3(new THREE.Vector3(-hx, bottom, z - hz), new THREE.Vector3(hx, top, z + hz));
}

/**
 * Hero on the bottle and the base mark. Both sit in the clear slot between
 * the panels, the hint row, and the dock.
 */
export function heroPose(design: Design, frame: StageFrame, fov = 30): CameraPose {
  const bounds = bottleHeroBounds(design);
  const safe = safeRect(frame);
  const fill = THREE.MathUtils.clamp((HERO_STAGE * frame.stageHeight) / Math.max(1, safe.height), 0.55, 0.9);
  return polarOnly(fitPose(bounds, HERO_DIR, fov, frame, fill, 0.94));
}

export function tuneUnboxCamera(camera: THREE.PerspectiveCamera, dist: number, radius: number): void {
  const span = Math.max(12, radius);
  const near = THREE.MathUtils.clamp(span * 0.02, 0.2, Math.max(0.35, dist * 0.04));
  const far = Math.max(span * 40, dist * 8);
  if (Math.abs(camera.near - near) < near * 0.2 && Math.abs(camera.far - far) < 20) return;
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
}
