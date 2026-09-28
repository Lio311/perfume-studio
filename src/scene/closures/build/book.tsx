import { RoundedBox } from "@react-three/drei";
import { partPivot } from "../../../model/closures/registry.ts";
import { BrandMark, InsertBlock, Magnet, Ribbon, Skin, Tub } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

const Book: ClosureBuilder = ({ fit, spec, dims, bind, ribbon, latch }) => {
  const spine = partPivot(spec, "spine", dims);
  return (
    <group>
      <Tub w={dims.w - dims.wall} h={dims.h - dims.wall * 2} d={dims.d - dims.wall} wall={dims.wall} />
      <InsertBlock fit={fit} />
      <group ref={bind("spine")} userData={{ hinge: "spine" }} position={spine}>
        <mesh position={[dims.wall / 2, -dims.h / 2, 0]}>
          <boxGeometry args={[dims.wall * 1.4, dims.h, dims.d]} />
          <Skin />
        </mesh>
        <RoundedBox args={[dims.w, dims.lidT, dims.d]} radius={1.4} smoothness={4} position={[dims.w / 2, -dims.lidT / 2, 0]}>
          <Skin />
        </RoundedBox>
        {latch === "magnet" && <Magnet position={[dims.w - 10, -dims.lidT - 0.5, 0]} rotation={[0, 0, Math.PI / 2]} />}
        <BrandMark w={dims.w} y={-dims.h * 0.42} z={dims.d / 2 + 0.5} />
      </group>
      {(ribbon || latch === "ribbon") && <Ribbon w={dims.w} h={dims.h * 0.4} d={dims.d} y={dims.h * 0.3} />}
    </group>
  );
};

export default Book;
