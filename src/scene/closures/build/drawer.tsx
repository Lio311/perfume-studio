import { BrandMark, InsertBlock, PullRibbon, PullTab, Ribbon, Skin, ThumbNotch, Tub } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

const Drawer: ClosureBuilder = ({ fit, dims, bind, ribbon, pullTab, latch, drawerPull }) => {
  const trayH = dims.h * 0.46;
  const trayW = dims.w - dims.wall * 2.6;
  const trayD = dims.d - dims.wall * 2.2;
  const trayWall = Math.max(1.2, dims.wall * 0.85);
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
        <group position={[0, 0.4, 0]}>
          <Tub w={trayW} h={trayH} d={trayD} wall={trayWall} front="full" />
        </group>
        <InsertBlock fit={fit} />
        {pullTab && <PullTab w={dims.w} z={trayD / 2 - trayWall} />}
        {drawerPull === "ribbon" && <PullRibbon y={trayH * 0.45} z={trayD / 2 + 2} />}
        <BrandMark w={trayW} y={trayH * 0.62} z={trayD / 2 - trayWall * 0.35} />
      </group>
    </group>
  );
};

export default Drawer;
