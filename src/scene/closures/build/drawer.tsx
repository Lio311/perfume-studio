import { BrandMark, InsertBlock, MARK_FACE_GAP, PullRibbon, PullTab, Ribbon, Skin, ThumbNotch, Tub } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

/** Tray front nearly fills the sleeve mouth. The 0.8 mm shortfall is the clearance under the ceiling. */
export function drawerTrayFront(h: number, wall: number): { trayH: number; y: number; opening: number } {
  const opening = h - 2 * wall;
  return { trayH: opening - 0.8, y: wall + 0.2, opening };
}

/** Half-torus radius plus the tube, the distance the pull hangs below its center. */
export const DRAWER_RIBBON_REACH = 8 + 0.85;

/** Ribbon pull, low on the tray front so it sits under the brand. Null when another pull is chosen. */
export function drawerRibbonPose(pull: string | undefined, trayH: number, trayD: number, floorTop = 0): { y: number; z: number } | null {
  if (pull !== "ribbon") return null;
  const preferred = Math.max(6, trayH * 0.16);
  const y = Math.max(floorTop + DRAWER_RIBBON_REACH, preferred);
  return { y, z: trayD / 2 + 1.2 };
}

const Drawer: ClosureBuilder = ({ fit, dims, bind, ribbon, pullTab, latch, drawerPull }) => {
  const front = drawerTrayFront(dims.h, dims.wall);
  const trayH = front.trayH;
  const trayW = dims.w - dims.wall * 2.6;
  const trayD = dims.d - dims.wall * 2.2;
  const trayWall = Math.max(1.2, dims.wall * 0.85);
  const pull = drawerRibbonPose(drawerPull, trayH, trayD, dims.wall);
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
        <group position={[0, front.y, 0]}>
          <Tub w={trayW} h={trayH} d={trayD} wall={trayWall} front="full" />
          <InsertBlock fit={fit} baseY={trayWall} span={{ w: Math.max(16, trayW - trayWall * 2 - 3.2), d: Math.max(16, trayD - trayWall * 2 - 3.2) }} />
        </group>
        {pullTab && <PullTab w={dims.w} z={trayD / 2 - trayWall} />}
        {pull && <PullRibbon y={pull.y} z={pull.z} />}
        <BrandMark w={trayW * 0.72} y={trayH * 0.58} z={trayD / 2 + MARK_FACE_GAP} />
      </group>
    </group>
  );
};

export default Drawer;
