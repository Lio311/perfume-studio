import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { partPivot } from "../../../model/closures/registry.ts";
import {
  tubeBaseHeight,
  tubeClosedY,
  tubeSleeveHeight,
  tubeSleeveLocalY,
} from "../../../model/closures/tube.ts";
import { labelInk, cartonMarkSize } from "../../../geometry/logos.ts";
import { logoById } from "../../../model/catalog.ts";
import { useLab } from "../../../store/labStore.ts";
import { LabelFinishMaterial } from "../../cartonMark.tsx";
import { useCartonLabelCanvas, useLabelMaps } from "../../labelPaint.ts";
import { PrismInsert, prismInsertOuter } from "./lift-off.tsx";
import { MARK_FACE_GAP, PrismMesh, PullTab, Ribbon } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

/** Clear radius inside the tube wall. */
export function tubeInnerRadius(outerRadius: number, wall: number): number {
  const board = Math.max(wall, 1.6);
  return Math.max(outerRadius * 0.72, outerRadius - board);
}

/** Radius handed to the round insert, 0.4 mm inside the cavity. */
export function tubeInsertRadius(inner: number): number {
  return inner - 0.4;
}

/** Outer radius of that insert. It has to stay inside the cavity circle. */
export function tubeInsertOuter(inner: number): number {
  return prismInsertOuter(tubeInsertRadius(inner));
}

/** Curved brand band: just outside the wall, about 60 degrees, about 35 mm along the arc. */
export function tubeMarkBand(radius: number): { radius: number; angle: number; arc: number; thetaStart: number } {
  const surface = Math.max(1, radius) + MARK_FACE_GAP;
  const angle = Math.PI / 3;
  return {
    radius: surface,
    angle,
    arc: surface * angle,
    thetaStart: -angle / 2,
  };
}

function TubeMark({ radius, y }: { radius: number; y: number }) {
  const blueprint = useLab((s) => s.blueprint);
  const variantId = useLab((s) => s.design.label.variantId);
  const color = useLab((s) => s.design.label.color);
  const text = useLab((s) => s.design.label.text);
  const spec = logoById(variantId);
  const ink = labelInk(color, spec.application);
  const canvas = useCartonLabelCanvas();
  const aspect = Number(canvas.dataset.aspect);
  const band = tubeMarkBand(radius);
  const { height } = cartonMarkSize(band.arc, aspect);
  const geo = useMemo(
    () => new THREE.CylinderGeometry(band.radius, band.radius, Math.max(height, 1), 48, 1, true, band.thetaStart, band.angle),
    [band.radius, band.angle, band.thetaStart, height],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  const { color: tex, mask, emissive } = useLabelMaps(canvas, ink, spec.application);
  if (blueprint || text.trim().length === 0) return null;
  return (
    <mesh geometry={geo} position={[0, y, 0]}>
      <LabelFinishMaterial map={tex} mask={mask} emissiveMap={emissive} ink={ink} application={spec.application} overlay />
    </mesh>
  );
}

/** Round tube. A short base stays put; the sleeve and cap lift so the bottle shows. */
const Tube: ClosureBuilder = ({ fit, spec, dims, bind, ribbon, pullTab, latch }) => {
  const lid = partPivot(spec, "lid", dims);
  const radius = Math.min(dims.w, dims.d) / 2 - 0.4;
  const wall = Math.max(dims.wall, 1.6);
  const inner = tubeInnerRadius(radius, wall);
  const lidR = radius + 0.7;
  const lidInner = Math.max(lidR - wall, lidR * 0.78);
  const tied = ribbon || latch === "ribbon";
  const baseH = tubeBaseHeight(dims);
  const closed = tubeClosedY(dims);
  return (
    <group>
      <PrismMesh radius={radius - 0.15} inner={0} height={dims.wall} sides={48} />
      <PrismMesh radius={radius} inner={inner} height={baseH} sides={48} />
      <PrismInsert radius={tubeInsertRadius(inner)} sides={48} fit={fit} baseY={dims.wall} />
      <group ref={bind("lid")} userData={{ hinge: "lid" }} position={lid}>
        <PrismMesh radius={radius} inner={inner} height={tubeSleeveHeight(dims)} sides={48} y={tubeSleeveLocalY(dims)} />
        <PrismMesh radius={lidR} inner={lidInner} height={Math.max(wall, dims.lidH - dims.wall)} sides={48} />
        <PrismMesh radius={lidR} inner={0} height={dims.wall} sides={48} y={Math.max(0, dims.lidH - dims.wall)} />
        <TubeMark radius={radius} y={dims.h * 0.48 - closed} />
        {pullTab && <PullTab w={dims.w} z={lidR + 1} />}
      </group>
      {tied && <Ribbon w={dims.w} h={dims.h * 0.42} d={radius * 2} y={dims.h * 0.55} />}
    </group>
  );
};

export default Tube;
