import { partPivot } from "../../../model/closures/registry.ts";
import {
  TUBE_SLEEVE_RADIUS_GAP,
  tubeBaseHeight,
  tubeClosedY,
  tubeSleeveHeight,
  tubeSleeveLocalY,
} from "../../../model/closures/tube.ts";
import { PrismInsert, prismInsertOuter } from "./lift-off.tsx";
import { PrismMesh, PullTab, RIBBON_COLOR, Ribbon } from "../kit.tsx";
import { cylinderRibbonYaw, splitRibbon } from "../ribbonPose.ts";
import { TubeMark } from "../tubeMark.tsx";
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
  const ribbonY = dims.h * 0.55;
  const yaw = cylinderRibbonYaw(radius, lidR, dims.w, lidR * 2);
  const sleeveD = (radius + TUBE_SLEEVE_RADIUS_GAP) * 2;
  const onBase = splitRibbon(ribbonY, dims.h, baseH);
  const onCap = splitRibbon(Math.max(ribbonY, baseH), dims.h, closed);
  return (
    <group>
      <PrismMesh radius={radius - 0.15} inner={0} height={dims.wall} sides={48} />
      <PrismMesh radius={radius} inner={inner} height={baseH} sides={48} />
      <PrismInsert radius={tubeInsertRadius(inner)} sides={48} fit={fit} baseY={dims.wall} />
      <group ref={bind("lid")} userData={{ hinge: "lid" }} position={lid}>
        <PrismMesh radius={radius + TUBE_SLEEVE_RADIUS_GAP} inner={inner} height={tubeSleeveHeight(dims)} sides={48} y={tubeSleeveLocalY(dims)} />
        <PrismMesh radius={lidR} inner={lidInner} height={Math.max(wall, dims.lidH - dims.wall)} sides={48} />
        <PrismMesh radius={lidR} inner={0} height={dims.wall} sides={48} y={Math.max(0, dims.lidH - dims.wall)} />
        <TubeMark radius={radius} y={dims.h * 0.48 - closed} />
        {tied && onCap.below && (
          <group rotation={[0, yaw, 0]}>
            <Ribbon w={dims.w} h={onCap.below.h} d={sleeveD} y={onCap.below.y - closed} cap={false} color={RIBBON_COLOR} />
          </group>
        )}
        {tied && onCap.above && (
          <group rotation={[0, yaw, 0]}>
            <Ribbon w={dims.w} h={onCap.above.h} d={lidR * 2} y={onCap.above.y - closed} color={RIBBON_COLOR} />
          </group>
        )}
        {!tied && pullTab && (
          <group rotation={[0, yaw, 0]}>
            <PullTab w={dims.w} y={-2} z={lidR + 0.4} color={RIBBON_COLOR} />
          </group>
        )}
      </group>
      {tied && onBase.below && (
        <group rotation={[0, yaw, 0]}>
          <Ribbon w={dims.w} h={onBase.below.h} d={radius * 2} y={onBase.below.y} cap={false} color={RIBBON_COLOR} />
        </group>
      )}
    </group>
  );
};

export default Tube;
