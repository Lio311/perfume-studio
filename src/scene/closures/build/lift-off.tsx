import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { partPivot } from "../../../model/closures/registry.ts";
import type { Fit } from "../../../model/fit.ts";
import { useLab } from "../../../store/labStore.ts";
import { prismFrontFacet } from "../prism.ts";
import { trayLiftNow } from "../../trayLift.ts";
import { BrandMark, InsertBlock, InsertFinish, Magnet, MARK_FACE_GAP, PrismMesh, PullTab, Ribbon, Skin, Tub } from "../kit.tsx";
import type { ClosureBuilder } from "../types.ts";

/** Width passed to the carton mark, and the plane's z, for the facet that faces the camera. */
export function octagonMarkPlacement(radius: number, sides: number): { z: number; width: number } {
  const face = prismFrontFacet(radius, sides);
  return { z: face.z + MARK_FACE_GAP, width: face.width };
}

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

/** Octagonal cradle in the insert material. Floor and walls do not share a start, and the tray lift carries it. */
function PrismInsert({ radius, sides, fit, baseY }: { radius: number; sides: number; fit: Fit; baseY: number }) {
  const orientation = useLab((s) => s.design.box.insert?.orientation ?? "standing");
  const outer = Math.max(8, radius - 1.1);
  const wall = Math.max(2.2, outer * 0.14);
  const inner = Math.max(5, outer - wall);
  const floor = Math.max(1.6, fit.floorMm);
  const wallH = Math.min(Math.max(12, fit.cavityH * 0.4), Math.max(14, fit.boxH * 0.36));
  const y0 = Math.max(baseY, fit.boardMm);
  const lying = orientation === "lying";
  const span = Math.max(16, inner * 1.85);
  const channelW = Math.min(fit.cavityW, span - 6);
  const channelD = Math.min(fit.cavityD, span - 4);
  const channelH = Math.min(Math.max(8, fit.cavityH * 0.62), fit.boxH * 0.45);
  const side = Math.max(3, (span - channelW) / 2);
  const end = Math.max(2.4, (span - channelD) / 2);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.y = y0 + trayLiftNow.mm;
  });
  return (
    <group ref={ref} position={[0, y0, 0]}>
      <PrismMesh finish="insert" radius={outer} inner={0} height={floor} sides={sides} />
      {lying ? (
        <group position={[0, floor, 0]}>
          <mesh position={[-(channelW / 2 + side / 2), channelH / 2, 0]}>
            <boxGeometry args={[side, channelH, Math.max(4, span - end * 2)]} />
            <InsertFinish />
          </mesh>
          <mesh position={[channelW / 2 + side / 2, channelH / 2, 0]}>
            <boxGeometry args={[side, channelH, Math.max(4, span - end * 2)]} />
            <InsertFinish />
          </mesh>
          <mesh position={[0, channelH / 2, -(channelD / 2 + end / 2)]}>
            <boxGeometry args={[span, channelH, end]} />
            <InsertFinish />
          </mesh>
          <mesh position={[0, channelH / 2, channelD / 2 + end / 2]}>
            <boxGeometry args={[span, channelH, end]} />
            <InsertFinish />
          </mesh>
        </group>
      ) : (
        <PrismMesh finish="insert" radius={outer} inner={inner} height={wallH} sides={sides} y={floor} />
      )}
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
    const face = octagonMarkPlacement(lidR, sides);
    const baseFace = octagonMarkPlacement(radius, sides);
    return (
      <group>
        <PrismMesh radius={radius - 0.15} inner={0} height={dims.wall} sides={sides} />
        <PrismMesh radius={radius} inner={inner} height={trayH} sides={sides} />
        {shoulder && <PrismMesh radius={neckR} inner={Math.max(neckR - wall, neckR * 0.72)} height={neckRise} sides={Math.max(8, sides)} y={dims.baseH} />}
        <PrismInsert radius={inner - 0.4} sides={sides} fit={fit} baseY={dims.wall} />
        <group ref={bind("lid")} userData={{ hinge: "lid" }} position={lid}>
          <PrismMesh radius={lidR} inner={lidInner} height={Math.max(wall, dims.lidH - dims.wall)} sides={sides} />
          <PrismMesh radius={lidR} inner={0} height={dims.wall} sides={sides} y={Math.max(0, dims.lidH - dims.wall)} />
          {telescope && <BrandMark w={face.width} y={dims.lidH * 0.55} z={face.z} />}
          {telescope && sides <= 12 && (
            <group position={[0, dims.lidH + MARK_FACE_GAP, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <BrandMark w={face.width} y={0} z={0} />
            </group>
          )}
          {pullTab && <PullTab w={Math.min(dims.w, face.width)} z={face.z} />}
        </group>
        {!telescope && <BrandMark w={baseFace.width} y={trayH * 0.55} z={baseFace.z} />}
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
        {telescope && <BrandMark w={lidW} y={dims.lidH * 0.46} z={lidD / 2 + MARK_FACE_GAP} />}
        {pullTab && <PullTab w={dims.w} z={lidD / 2 + MARK_FACE_GAP} />}
      </group>
      {!telescope && <BrandMark w={dims.w} y={trayH * 0.48} z={dims.d / 2 + MARK_FACE_GAP} />}
      {tied && <Ribbon w={dims.w} h={dims.h * 0.42} d={telescope ? dims.d + 3.2 : dims.d} y={dims.h * 0.28} />}
    </group>
  );
};

export default LiftOff;
