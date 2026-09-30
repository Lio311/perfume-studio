import { RoundedBox } from "@react-three/drei";
import { partPivot } from "../../../model/closures/registry.ts";
import { InsertBlock, Magnet, Skin, Tub } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

const Clamshell: ClosureBuilder = ({ fit, spec, dims, bind, latch }) => {
  const lid = partPivot(spec, "lid", dims);
  const lidDepth = dims.h - dims.baseH;
  
  return (
    <group>
      {/* The base tub */}
      <Tub w={dims.w} h={dims.baseH} d={dims.d} wall={dims.wall} />
      {/* The base magnet */}
      {latch === "magnet" && <Magnet position={[0, dims.baseH - 5, dims.d / 2 - dims.wall / 2]} rotation={[Math.PI / 2, 0, 0]} />}
      
      <InsertBlock fit={fit} />
      
      <group ref={bind("lid")} userData={{ hinge: "lid" }} position={lid}>
        <group position={[0, lidDepth, dims.d / 2]}>
          {/* Top panel */}
          <RoundedBox args={[dims.w, dims.lidT, dims.d]} radius={1.3} smoothness={4} position={[0, -dims.lidT / 2, 0]}>
            <Skin />
          </RoundedBox>
          {/* The lid walls (inverted tub) */}
          <group rotation={[Math.PI, 0, 0]} position={[0, -dims.lidT, 0]}>
            <Tub w={dims.w} h={lidDepth - dims.lidT} d={dims.d} wall={dims.wall} />
          </group>
          {/* Lid magnet */}
          {latch === "magnet" && <Magnet position={[0, -lidDepth + 5, dims.d / 2 - dims.wall / 2]} rotation={[-Math.PI / 2, 0, 0]} />}
        </group>
      </group>
    </group>
  );
};

export default Clamshell;
