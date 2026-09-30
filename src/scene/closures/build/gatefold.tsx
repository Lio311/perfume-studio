import { RoundedBox } from "@react-three/drei";
import { partPivot } from "../../../model/closures/registry.ts";
import { BrandMark, InsertBlock, Magnet, MARK_FACE_GAP, Skin, Tub } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

const Gatefold: ClosureBuilder = ({ fit, spec, dims, bind, latch }) => {
  const leftPivot = partPivot(spec, "door-left", dims);
  const rightPivot = partPivot(spec, "door-right", dims);
  return (
    <group>
      <Tub w={dims.w - dims.wall} h={dims.h - dims.wall * 2} d={dims.d - dims.wall} wall={dims.wall} />
      <InsertBlock fit={fit} />
      <group ref={bind("door-left")} userData={{ hinge: "door-left" }} position={leftPivot}>
        <mesh position={[dims.wall / 2, dims.h / 2, -dims.d / 2]}>
          <boxGeometry args={[dims.wall * 1.4, dims.h, dims.d]} />
          <Skin />
        </mesh>
        <RoundedBox args={[dims.w / 2, dims.h, dims.wall]} radius={1} smoothness={4} position={[dims.w / 4, dims.h / 2, -dims.wall / 2]}>
          <Skin />
        </RoundedBox>
        {latch === "magnet" && <Magnet position={[dims.w / 2 - 4, dims.h / 2, -dims.wall]} rotation={[0, 0, 0]} />}
        <BrandMark w={dims.w / 2} y={dims.h / 2} z={MARK_FACE_GAP} />
      </group>
      <group ref={bind("door-right")} userData={{ hinge: "door-right" }} position={rightPivot}>
        <mesh position={[-dims.wall / 2, dims.h / 2, -dims.d / 2]}>
          <boxGeometry args={[dims.wall * 1.4, dims.h, dims.d]} />
          <Skin />
        </mesh>
        <RoundedBox args={[dims.w / 2, dims.h, dims.wall]} radius={1} smoothness={4} position={[-dims.w / 4, dims.h / 2, -dims.wall / 2]}>
          <Skin />
        </RoundedBox>
        {latch === "magnet" && <Magnet position={[-dims.w / 2 + 4, dims.h / 2, -dims.wall]} rotation={[0, 0, 0]} />}
      </group>
    </group>
  );
};

export default Gatefold;
