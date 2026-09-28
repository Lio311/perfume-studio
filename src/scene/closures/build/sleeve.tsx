import { partPivot } from "../../../model/closures/registry.ts";
import { BrandMark, InsertBlock, PullTab, Ribbon, Skin, Tub } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

const Sleeve: ClosureBuilder = ({ fit, spec, dims, bind, ribbon, pullTab, latch }) => {
  const sleeve = partPivot(spec, "sleeve", dims);
  const innerW = dims.w - dims.wall * 1.6;
  const innerD = dims.d - dims.wall * 1.6;
  const innerH = dims.h * 0.9;
  return (
    <group>
      <group>
        <Tub w={innerW} h={innerH} d={innerD} wall={dims.wall} />
        <InsertBlock fit={fit} />
        <BrandMark w={innerW} y={innerH * 0.42} z={innerD / 2 + 0.4} />
      </group>
      <group ref={bind("sleeve")} userData={{ hinge: "sleeve" }} position={sleeve}>
        <mesh position={[0, 0, -dims.d / 2 + dims.wall / 2]}><boxGeometry args={[dims.w, dims.h, dims.wall]} /><Skin /></mesh>
        <mesh position={[0, 0, dims.d / 2 - dims.wall / 2]}><boxGeometry args={[dims.w, dims.h, dims.wall]} /><Skin /></mesh>
        <mesh position={[-dims.w / 2 + dims.wall / 2, 0, 0]}><boxGeometry args={[dims.wall, dims.h, dims.d]} /><Skin /></mesh>
        <mesh position={[dims.w / 2 - dims.wall / 2, 0, 0]}><boxGeometry args={[dims.wall, dims.h, dims.d]} /><Skin /></mesh>
        {pullTab && <PullTab w={dims.w} z={dims.d / 2 + 0.8} />}
        {(ribbon || latch === "ribbon") && <Ribbon w={dims.w} h={dims.h * 0.5} d={dims.d} y={-dims.h * 0.15} />}
      </group>
    </group>
  );
};

export default Sleeve;
