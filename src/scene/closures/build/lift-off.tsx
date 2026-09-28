import { RoundedBox } from "@react-three/drei";
import { partPivot } from "../../../model/closures/registry.ts";
import { BrandMark, InsertBlock, PullTab, Ribbon, Skin, Tub } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

const LiftOff: ClosureBuilder = ({ form, fit, spec, dims, bind, ribbon, pullTab }) => {
  const lid = partPivot(spec, "lid", dims);
  const lidH = Math.max(dims.h * 0.28, 18);
  const shoulder = 12;
  return (
    <group>
      <Tub w={dims.w} h={dims.baseH} d={dims.d} wall={dims.wall} />
      <mesh position={[0, dims.baseH - shoulder / 2, 0]}>
        <boxGeometry args={[dims.w - dims.wall * 3.2, shoulder, dims.d - dims.wall * 3.2]} />
        <Skin />
      </mesh>
      <InsertBlock fit={fit} />
      {form === "window" && (
        <mesh position={[0, dims.baseH * 0.55, dims.d / 2 + 0.2]}>
          <planeGeometry args={[dims.w * 0.56, dims.baseH * 0.42]} />
          <meshPhysicalMaterial color="#d5dde6" roughness={0.05} transmission={0.65} thickness={0.6} ior={1.5} transparent opacity={0.35} />
        </mesh>
      )}
      <group ref={bind("lid")} userData={{ hinge: "lid" }} position={lid}>
        <RoundedBox args={[dims.w + 0.6, lidH, dims.d + 0.6]} radius={1.6} smoothness={4} position={[0, lidH / 2, 0]}>
          <Skin />
        </RoundedBox>
        {pullTab && <PullTab w={dims.w} z={dims.d / 2 + 0.9} />}
      </group>
      <BrandMark w={dims.w} y={dims.baseH * 0.48} z={dims.d / 2 + 0.55} />
      {ribbon && <Ribbon w={dims.w} h={dims.h * 0.42} d={dims.d} y={dims.h * 0.28} />}
    </group>
  );
};

export default LiftOff;
