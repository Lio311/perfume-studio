import { RoundedBox } from "@react-three/drei";
import { partPivot } from "../../../model/closures/registry.ts";
import { BrandMark, InsertBlock, Ribbon, Skin, Tub } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

const Magnetic: ClosureBuilder = ({ fit, spec, dims, bind, ribbon }) => {
  const lid = partPivot(spec, "lid", dims);
  const flap = partPivot(spec, "flap", dims);
  const flapH = dims.baseH * 0.9;
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
          <BrandMark w={dims.w} y={dims.wall + 0.35} z={flapH * 0.55} />
        </group>
      </group>
      {ribbon && <Ribbon w={dims.w} h={dims.baseH * 0.55} d={dims.d} y={dims.baseH * 0.2} />}
    </group>
  );
};

export default Magnetic;
