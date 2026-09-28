import { partPivot } from "../../../model/closures/registry.ts";
import { BrandMark, InsertBlock, Magnet, PrismMesh, PullTab, Ribbon, Skin, Tub } from "../kit.tsx";
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
      <pointLight position={[0, h * 0.42, 0]} intensity={8} distance={Math.max(100, h * 1.8)} decay={2} color="#fff3e2" />
    </group>
  );
}

function facetFace(radius: number, sides: number): { z: number; width: number } {
  const step = Math.PI / Math.max(3, sides);
  return { z: radius * Math.cos(step), width: 2 * radius * Math.sin(step) };
}

/** Octagonal (or round) cradle. Same footprint family and wrap as the shell, sitting inside it. */
function PrismInsert({ radius, sides }: { radius: number; sides: number }) {
  const outer = Math.max(8, radius - 1.1);
  const wall = Math.max(2.2, outer * 0.14);
  const inner = Math.max(5, outer - wall);
  const floor = 2.2;
  const wallH = Math.min(36, Math.max(18, outer * 0.62));
  return (
    <group>
      <PrismMesh radius={outer} inner={0} height={floor} sides={sides} />
      <PrismMesh radius={outer} inner={inner} height={wallH} sides={sides} />
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
  const telescope = !shoulder && dims.lidH >= dims.h * 0.9;
  const trayH = telescope ? Math.max(dims.wall * 6, dims.h * 0.38) : dims.baseH;
  if (shape.type === "cylinder" || shape.type === "polygon") {
    const sides = shape.type === "polygon" ? Math.min(12, Math.max(3, Math.round(shape.sides ?? 8))) : 48;
    const radius = Math.min(dims.w, dims.d) / 2 - 0.4;
    const wall = Math.max(dims.wall, 1.6);
    const inner = Math.max(radius * 0.72, radius - wall);
    const neckR = Math.max(inner * 0.86, radius * 0.62);
    const lidR = radius + 0.7;
    const lidInner = Math.max(lidR - wall, lidR * 0.78);
    const face = facetFace(lidR, sides);
    const markW = Math.max(12, face.width * 0.78);
    return (
      <group>
        <PrismMesh radius={radius - 0.15} inner={0} height={dims.wall} sides={sides} />
        <PrismMesh radius={radius} inner={inner} height={trayH} sides={sides} />
        {shoulder && <PrismMesh radius={neckR} inner={Math.max(neckR - wall, neckR * 0.72)} height={neckRise} sides={Math.max(8, sides)} y={dims.baseH} />}
        <PrismInsert radius={inner - 0.4} sides={sides} />
        <group ref={bind("lid")} userData={{ hinge: "lid" }} position={lid}>
          <PrismMesh radius={lidR} inner={lidInner} height={Math.max(wall, dims.lidH - dims.wall)} sides={sides} />
          <PrismMesh radius={lidR} inner={0} height={dims.wall} sides={sides} y={Math.max(0, dims.lidH - dims.wall)} />
          {telescope && <BrandMark w={markW} y={dims.lidH * 0.55} z={face.z - 0.5} />}
          {pullTab && <PullTab w={Math.min(dims.w, face.width)} z={face.z + 0.2} />}
        </group>
        {!telescope && <BrandMark w={Math.max(12, facetFace(radius, sides).width * 0.78)} y={trayH * 0.55} z={facetFace(radius, sides).z - 0.5} />}
        {tied && <Ribbon w={dims.w} h={dims.h * 0.42} d={radius * 2 + (telescope ? 2.4 : 0)} y={dims.h * 0.28} />}
      </group>
    );
  }
  return (
    <group>
      <Tub w={dims.w} h={trayH} d={dims.d} wall={dims.wall} />
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
        {telescope && <BrandMark w={lidW} y={dims.lidH * 0.46} z={lidD / 2 + 0.4} />}
        {pullTab && <PullTab w={dims.w} z={lidD / 2 + 0.4} />}
      </group>
      {!telescope && <BrandMark w={dims.w} y={trayH * 0.48} z={dims.d / 2 + 0.55} />}
      {tied && <Ribbon w={dims.w} h={dims.h * 0.42} d={telescope ? dims.d + 3.2 : dims.d} y={dims.h * 0.28} />}
    </group>
  );
};

export default LiftOff;
