import { RoundedBox } from "@react-three/drei";
import { partPivot } from "../../../model/closures/registry.ts";
import { BrandMark, InsertBlock, MAGNET_RADIUS, MAGNET_THICKNESS, Magnet, MARK_FACE_GAP, Ribbon, Skin, Tub } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

/** Magnet centered in the flap board, lying flat so the disc stays inside the panel. */
export function flapMagnetPose(wall: number, boxW: number, flapH: number): {
  x: number;
  y: number;
  z: number;
  radius: number;
  thickness: number;
  panelMinX: number;
  panelMaxX: number;
  panelMinY: number;
  panelMaxY: number;
  panelMinZ: number;
  panelMaxZ: number;
} {
  const panelH = wall * 1.6;
  const center = wall / 2;
  return {
    x: boxW * 0.22,
    y: wall * 0.5,
    z: flapH - 5,
    radius: MAGNET_RADIUS,
    thickness: MAGNET_THICKNESS,
    panelMinX: -boxW / 2,
    panelMaxX: boxW / 2,
    panelMinY: center - panelH / 2,
    panelMaxY: center + panelH / 2,
    panelMinZ: 0,
    panelMaxZ: flapH,
  };
}

const HingedLid: ClosureBuilder = ({ fit, spec, dims, bind, ribbon, latch }) => {
  const lid = partPivot(spec, "lid", dims);
  const flap = partPivot(spec, "flap", dims);
  const flapH = dims.baseH * 0.9;
  const magnet = flapMagnetPose(dims.wall, dims.w, flapH);
  const tied = ribbon || latch === "ribbon";
  return (
    <group>
      <Tub w={dims.w} h={dims.baseH} d={dims.d} wall={dims.wall} front="lip" />
      <InsertBlock fit={fit} />
      <group ref={bind("lid")} userData={{ hinge: "lid" }} position={lid}>
        <RoundedBox args={[dims.w, dims.lidT, dims.d]} radius={1.3} smoothness={4} position={[0, dims.lidT / 2, dims.d / 2]}>
          <Skin />
        </RoundedBox>
        <group ref={bind("flap")} userData={{ hinge: "flap" }} position={flap}>
          <mesh position={[0, dims.wall / 2, flapH / 2]}>
            <boxGeometry args={[dims.w, dims.wall * 1.6, flapH]} />
            <Skin />
          </mesh>
          {latch === "magnet" && <Magnet position={[magnet.x, magnet.y, magnet.z]} />}
          <group position={[0, dims.wall * 1.3 + MARK_FACE_GAP, flapH * 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
            <BrandMark w={dims.w} y={0} z={0} />
          </group>
        </group>
      </group>
      {tied && <Ribbon w={dims.w} h={dims.baseH * 0.55} d={dims.d} y={dims.baseH * 0.2} />}
    </group>
  );
};

export default HingedLid;
