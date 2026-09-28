import { partPivot } from "../../../model/closures/registry.ts";
import { BrandMark, InsertBlock, PullTab, Ribbon, Skin } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

/** Round tube. The cap lifts off the canister. */
const Tube: ClosureBuilder = ({ fit, spec, dims, bind, ribbon, pullTab, latch }) => {
  const lid = partPivot(spec, "lid", dims);
  const radius = Math.min(dims.w, dims.d) / 2 - 0.4;
  const lidR = radius + 0.9;
  const tied = ribbon || latch === "ribbon";
  return (
    <group>
      <mesh position={[0, dims.wall / 2, 0]}>
        <cylinderGeometry args={[radius - 0.4, radius - 0.4, dims.wall, 48]} />
        <Skin />
      </mesh>
      <mesh position={[0, dims.h / 2, 0]}>
        <cylinderGeometry args={[radius, radius, dims.h, 48, 1, true]} />
        <Skin />
      </mesh>
      <InsertBlock fit={fit} />
      <group ref={bind("lid")} userData={{ hinge: "lid" }} position={lid}>
        <mesh position={[0, dims.lidH - dims.wall / 2, 0]}>
          <cylinderGeometry args={[lidR, lidR, dims.wall, 48]} />
          <Skin />
        </mesh>
        <mesh position={[0, dims.lidH / 2, 0]}>
          <cylinderGeometry args={[lidR, lidR, dims.lidH, 48, 1, true]} />
          <Skin />
        </mesh>
        {pullTab && <PullTab w={dims.w} z={lidR + 1} />}
      </group>
      <BrandMark w={dims.w} y={dims.h * 0.48} z={radius + 0.6} />
      {tied && <Ribbon w={dims.w} h={dims.h * 0.42} d={dims.d} y={dims.h * 0.55} />}
    </group>
  );
};

export default Tube;
