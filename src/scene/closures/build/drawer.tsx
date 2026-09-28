import { BrandMark, InsertBlock, PullRibbon, PullTab, Ribbon, Skin, ThumbNotch } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

const Drawer: ClosureBuilder = ({ fit, dims, bind, ribbon, pullTab, latch, drawerPull }) => {
  const trayH = dims.h * 0.42;
  return (
    <group>
      <group userData={{ hinge: "sleeve" }}>
        <mesh position={[0, dims.h / 2, -dims.d / 2 + dims.wall / 2]}><boxGeometry args={[dims.w, dims.h, dims.wall]} /><Skin /></mesh>
        <mesh position={[-dims.w / 2 + dims.wall / 2, dims.h / 2, 0]}><boxGeometry args={[dims.wall, dims.h, dims.d]} /><Skin /></mesh>
        <mesh position={[dims.w / 2 - dims.wall / 2, dims.h / 2, 0]}><boxGeometry args={[dims.wall, dims.h, dims.d]} /><Skin /></mesh>
        <mesh position={[0, dims.h - dims.wall / 2, 0]}><boxGeometry args={[dims.w - dims.wall * 2, dims.wall, dims.d - dims.wall]} /><Skin /></mesh>
        <mesh position={[0, dims.wall / 2, 0]}><boxGeometry args={[dims.w, dims.wall, dims.d]} /><Skin /></mesh>
        {(ribbon || latch === "ribbon") && <Ribbon w={dims.w} h={dims.h * 0.55} d={dims.d} y={dims.h * 0.22} />}
        {drawerPull === "notch" && <ThumbNotch y={dims.h - dims.wall * 0.2} z={dims.d / 2 - 0.4} />}
      </group>
      <group ref={bind("tray")} userData={{ hinge: "tray" }}>
        <mesh position={[0, trayH / 2 + dims.wall, 0]}>
          <boxGeometry args={[dims.w - dims.wall * 3, trayH, dims.d - dims.wall * 2.4]} />
          <Skin />
        </mesh>
        <InsertBlock fit={fit} />
        {pullTab && <PullTab w={dims.w} z={dims.d / 2 - dims.wall} />}
        {drawerPull === "ribbon" && <PullRibbon y={trayH * 0.45} z={dims.d / 2 + 2} />}
        <BrandMark w={dims.w} y={trayH * 0.7} z={dims.d / 2 - dims.wall * 0.2} />
      </group>
    </group>
  );
};

export default Drawer;
