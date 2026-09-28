import { BrandMark, InsertBlock, PullTab, Ribbon, Skin } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

const Drawer: ClosureBuilder = ({ fit, dims, bind, ribbon, pullTab }) => {
  const trayH = dims.h * 0.42;
  return (
    <group>
      <group userData={{ hinge: "sleeve" }}>
        <mesh position={[0, dims.h / 2, -dims.d / 2 + dims.wall / 2]}><boxGeometry args={[dims.w, dims.h, dims.wall]} /><Skin /></mesh>
        <mesh position={[-dims.w / 2 + dims.wall / 2, dims.h / 2, 0]}><boxGeometry args={[dims.wall, dims.h, dims.d]} /><Skin /></mesh>
        <mesh position={[dims.w / 2 - dims.wall / 2, dims.h / 2, 0]}><boxGeometry args={[dims.wall, dims.h, dims.d]} /><Skin /></mesh>
        <mesh position={[0, dims.h - dims.wall / 2, 0]}><boxGeometry args={[dims.w - dims.wall * 2, dims.wall, dims.d - dims.wall]} /><Skin /></mesh>
        <mesh position={[0, dims.wall / 2, 0]}><boxGeometry args={[dims.w, dims.wall, dims.d]} /><Skin /></mesh>
        {ribbon && <Ribbon w={dims.w} h={dims.h * 0.55} d={dims.d} y={dims.h * 0.22} />}
      </group>
      <group ref={bind("tray")} userData={{ hinge: "tray" }}>
        <mesh position={[0, trayH / 2 + dims.wall, 0]}>
          <boxGeometry args={[dims.w - dims.wall * 3, trayH, dims.d - dims.wall * 2.4]} />
          <Skin />
        </mesh>
        <InsertBlock fit={fit} />
        {pullTab && <PullTab w={dims.w} z={dims.d / 2 - dims.wall} />}
        <BrandMark w={dims.w} y={trayH * 0.7} z={dims.d / 2 - dims.wall * 0.2} />
      </group>
    </group>
  );
};

export default Drawer;
