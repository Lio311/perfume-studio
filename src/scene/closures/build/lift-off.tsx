import { partPivot } from "../../../model/closures/registry.ts";
import { BrandMark, InsertBlock, Magnet, PullTab, Ribbon, Skin, Tub } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

function LidShell({ w, h, d, wall }: { w: number; h: number; d: number; wall: number }) {
  const y = h / 2;
  return (
    <group>
      <mesh position={[0, h - wall / 2, 0]}>
        <boxGeometry args={[w, wall, d]} />
        <Skin />
      </mesh>
      <mesh position={[0, y, -d / 2 + wall / 2]}>
        <boxGeometry args={[w, h, wall]} />
        <Skin />
      </mesh>
      <mesh position={[0, y, d / 2 - wall / 2]}>
        <boxGeometry args={[w, h, wall]} />
        <Skin />
      </mesh>
      <mesh position={[-w / 2 + wall / 2, y, 0]}>
        <boxGeometry args={[wall, h, d - wall * 2]} />
        <Skin />
      </mesh>
      <mesh position={[w / 2 - wall / 2, y, 0]}>
        <boxGeometry args={[wall, h, d - wall * 2]} />
        <Skin />
      </mesh>
    </group>
  );
}

const LiftOff: ClosureBuilder = ({ form, fit, spec, dims, bind, ribbon, pullTab, latch, shape }) => {
  const lid = partPivot(spec, "lid", dims);
  const shoulder = dims.neckH > 0;
  const lidW = shoulder ? dims.w : dims.w + 1.6;
  const lidD = shoulder ? dims.d : dims.d + 1.6;
  const overlap = shoulder ? Math.min(dims.lidH * 0.35, 8) : 0;
  const neckRise = dims.neckH + overlap;
  const tied = ribbon || latch === "ribbon";
  if (shape.type === "cylinder" || shape.type === "polygon") {
    const radius = Math.min(dims.w, dims.d) / 2 - 0.4;
    const segments = shape.type === "polygon" ? Math.min(12, Math.max(3, Math.round(shape.sides ?? 8))) : 48;
    const neckR = Math.max(radius * 0.72, radius - dims.wall * 2.2);
    const lidR = radius + 0.8;
    return (
      <group>
        <mesh position={[0, dims.wall / 2, 0]}>
          <cylinderGeometry args={[radius - 0.4, radius - 0.4, dims.wall, segments]} />
          <Skin />
        </mesh>
        <mesh position={[0, dims.baseH / 2, 0]}>
          <cylinderGeometry args={[radius, radius, dims.baseH, segments, 1, true]} />
          <Skin />
        </mesh>
        {shoulder && (
          <mesh position={[0, dims.baseH + neckRise / 2, 0]}>
            <cylinderGeometry args={[neckR, neckR, neckRise, Math.max(8, segments), 1, true]} />
            <Skin />
          </mesh>
        )}
        <InsertBlock fit={fit} />
        <group ref={bind("lid")} userData={{ hinge: "lid" }} position={lid}>
          <mesh position={[0, dims.lidH - dims.wall / 2, 0]}>
            <cylinderGeometry args={[lidR, lidR, dims.wall, segments]} />
            <Skin />
          </mesh>
          <mesh position={[0, dims.lidH / 2, 0]}>
            <cylinderGeometry args={[lidR, lidR, dims.lidH, segments, 1, true]} />
            <Skin />
          </mesh>
          {pullTab && <PullTab w={dims.w} z={radius + 1} />}
        </group>
        {tied && <Ribbon w={dims.w} h={dims.h * 0.42} d={dims.d} y={dims.h * 0.28} />}
      </group>
    );
  }
  return (
    <group>
      <Tub w={dims.w} h={dims.baseH} d={dims.d} wall={dims.wall} />
      {shoulder && (
        <mesh position={[0, dims.baseH + neckRise / 2, 0]}>
          <boxGeometry args={[dims.w - dims.wall * 3.2, neckRise, dims.d - dims.wall * 3.2]} />
          <Skin />
        </mesh>
      )}
      <InsertBlock fit={fit} />
      {form === "window" && (
        <mesh position={[0, dims.baseH * 0.55, dims.d / 2 + 0.2]}>
          <planeGeometry args={[dims.w * 0.56, dims.baseH * 0.42]} />
          <meshPhysicalMaterial color="#d5dde6" roughness={0.05} transmission={0.65} thickness={0.6} ior={1.5} transparent opacity={0.35} />
        </mesh>
      )}
      <group ref={bind("lid")} userData={{ hinge: "lid" }} position={lid}>
        <LidShell w={lidW} h={dims.lidH} d={lidD} wall={dims.wall} />
        {latch === "magnet" && (
          <>
            <Magnet position={[-dims.w * 0.28, dims.wall + 0.6, dims.d * 0.18]} />
            <Magnet position={[dims.w * 0.28, dims.wall + 0.6, dims.d * 0.18]} />
          </>
        )}
        {pullTab && <PullTab w={dims.w} z={lidD / 2 + 0.4} />}
      </group>
      <BrandMark w={dims.w} y={dims.baseH * 0.48} z={dims.d / 2 + 0.55} />
      {tied && <Ribbon w={dims.w} h={dims.h * 0.42} d={dims.d} y={dims.h * 0.28} />}
    </group>
  );
};

export default LiftOff;
