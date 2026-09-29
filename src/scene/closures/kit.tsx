import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { InsertMaterial } from "../../model/types.ts";
import type { Fit } from "../../model/fit.ts";
import { useLab } from "../../store/labStore.ts";
import { CartonMark } from "../cartonMark.tsx";
import { FinishMaterial, WrapMaterial } from "../materials.tsx";
import { outerWrapMaterialProps } from "./outerWrap.ts";
import { prismShell } from "./prism.ts";
import { sectionPlane } from "../sectionPlane.ts";
import { trayLiftNow } from "../trayLift.ts";

const INSERT_COLOR: Record<InsertMaterial, string> = {
  eva: "#2c2e33",
  pulp: "#e4d5c0",
  card: "#d5cfc6",
  "velvet-foam": "#5a2433",
};

export function Skin({ section = true }: { section?: boolean }) {
  const blueprint = useLab((s) => s.blueprint);
  const finish = useLab((s) => s.design.box.finish);
  const color = useLab((s) => s.design.box.color);
  const wrap = useLab((s) => s.design.box.wrap);
  const board = useLab((s) => s.design.box.material);
  if (blueprint || finish === "gold" || finish === "silver" || finish === "rose") {
    return <FinishMaterial finish={finish} color={color} section={section} />;
  }
  return <WrapMaterial color={wrap?.color || color} finish={wrap?.finish || "soft-touch"} board={board || "rigid"} section={section} />;
}

/** Brand plane in front of a board face. Callers add this; the mark itself does not. */
export const MARK_FACE_GAP = 0.2;

/** Foil or print on the board. No dark plate unless print is given a plate colour. */
export function BrandMark({ w, y, z }: { w: number; y: number; z: number }) {
  return <CartonMark w={w} y={y} z={z} />;
}

export function InsertFinish() {
  const material = useLab((s) => s.design.box.insert?.material ?? "eva");
  const cutaway = useLab((s) => s.cutaway);
  const color = INSERT_COLOR[material];
  const velvet = material === "velvet-foam";
  const planes = cutaway ? [sectionPlane] : undefined;
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={velvet ? 0.78 : 0.9}
      sheen={velvet ? 1 : 0}
      sheenColor={color}
      sheenRoughness={0.42}
      envMapIntensity={0.72}
      clippingPlanes={planes}
    />
  );
}

export function PrismMesh({
  radius,
  inner,
  height,
  sides,
  y = 0,
  finish = "wrap",
}: {
  radius: number;
  inner: number;
  height: number;
  sides: number;
  y?: number;
  finish?: "wrap" | "insert";
}) {
  const geo = useMemo(() => prismShell(radius, inner, height, sides), [radius, inner, height, sides]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[0, y, 0]}>
      {finish === "insert" ? <InsertFinish /> : <Skin />}
    </mesh>
  );
}

function useWell(width: number, depth: number, height: number, holeW: number, holeD: number) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    const hw = width / 2;
    const hd = depth / 2;
    shape.moveTo(-hw, -hd);
    shape.lineTo(hw, -hd);
    shape.lineTo(hw, hd);
    shape.lineTo(-hw, hd);
    shape.closePath();
    const hole = new THREE.Path();
    const rx = Math.min(hw - 1.4, Math.max(4, holeW / 2));
    const ry = Math.min(hd - 1.4, Math.max(4, holeD / 2));
    hole.absellipse(0, 0, rx, ry, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);
    const extruded = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(4, height),
      bevelEnabled: true,
      bevelThickness: 0.35,
      bevelSize: 0.4,
      bevelSegments: 2,
      curveSegments: 40,
    });
    extruded.rotateX(-Math.PI / 2);
    extruded.computeVertexNormals();
    return extruded;
  }, [width, depth, height, holeW, holeD]);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

export function InsertBlock({ fit, span, baseY }: { fit: Fit; span?: { w: number; d: number }; baseY?: number }) {
  const material = useLab((s) => s.design.box.insert?.material ?? "eva");
  const orientation = useLab((s) => s.design.box.insert?.orientation ?? "standing");
  const cutaway = useLab((s) => s.cutaway);
  const color = INSERT_COLOR[material];
  const velvet = material === "velvet-foam";
  const wall = Math.max(fit.boardMm, 1.2);
  const maxW = span ? Math.max(12, span.w) : Math.max(12, fit.boxW - wall * 2 - 1.2);
  const maxD = span ? Math.max(12, span.d) : Math.max(12, fit.boxD - wall * 2 - 1.2);
  const width = Math.min(fit.insertW, maxW);
  const depth = Math.min(fit.insertD, maxD);
  const wellH = span
    ? Math.min(22, Math.max(10, fit.cavityH * 0.22))
    : Math.min(Math.max(12, fit.cavityH * 0.4), fit.boxH * 0.36);
  const well = useWell(width, depth, wellH, fit.cavityW, fit.cavityD);
  const planes = cutaway ? [sectionPlane] : undefined;
  const y0 = baseY ?? wall;
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.y = y0 + trayLiftNow.mm;
  });
  if (orientation === "lying") {
    const channelW = Math.min(fit.cavityW, width - 6);
    const channelD = Math.min(fit.cavityD, depth - 4);
    const channelH = Math.min(fit.cavityH * 0.62, fit.boxH * 0.45);
    const side = Math.max(3, (width - channelW) / 2);
    const end = Math.max(2.4, (depth - channelD) / 2);
    return (
      <group ref={ref} position={[0, y0, 0]}>
        <mesh position={[0, fit.floorMm / 2, 0]}>
          <boxGeometry args={[width, fit.floorMm, depth]} />
          <meshPhysicalMaterial color={color} roughness={velvet ? 0.8 : 0.9} sheen={velvet ? 1 : 0} sheenColor={color} sheenRoughness={0.4} envMapIntensity={0.72} clippingPlanes={planes} />
        </mesh>
        <mesh position={[-(channelW / 2 + side / 2), fit.floorMm + channelH / 2, 0]}>
          <boxGeometry args={[side, channelH, depth - end * 2]} />
          <meshPhysicalMaterial color={color} roughness={0.88} sheen={velvet ? 1 : 0} sheenColor={color} clippingPlanes={planes} />
        </mesh>
        <mesh position={[channelW / 2 + side / 2, fit.floorMm + channelH / 2, 0]}>
          <boxGeometry args={[side, channelH, depth - end * 2]} />
          <meshPhysicalMaterial color={color} roughness={0.88} sheen={velvet ? 1 : 0} sheenColor={color} clippingPlanes={planes} />
        </mesh>
        <mesh position={[0, fit.floorMm + channelH / 2, -(channelD / 2 + end / 2)]}>
          <boxGeometry args={[width, channelH, end]} />
          <meshPhysicalMaterial color={color} roughness={0.88} clippingPlanes={planes} />
        </mesh>
        <mesh position={[0, fit.floorMm + channelH / 2, channelD / 2 + end / 2]}>
          <boxGeometry args={[width, channelH, end]} />
          <meshPhysicalMaterial color={color} roughness={0.88} clippingPlanes={planes} />
        </mesh>
      </group>
    );
  }
  return (
    <group ref={ref} position={[0, y0, 0]}>
      <mesh position={[0, fit.floorMm / 2, 0]}>
        <boxGeometry args={[width, fit.floorMm, depth]} />
        <meshPhysicalMaterial color={color} roughness={velvet ? 0.78 : 0.92} sheen={velvet ? 1 : 0} sheenColor={color} sheenRoughness={0.42} clippingPlanes={planes} />
      </mesh>
      <mesh geometry={well} position={[0, fit.floorMm, 0]}>
        <meshPhysicalMaterial color={color} roughness={velvet ? 0.72 : 0.78} metalness={0.04} sheen={velvet ? 1 : 0.18} sheenColor={velvet ? color : "#8a8176"} sheenRoughness={0.46} envMapIntensity={0.9} clippingPlanes={planes} />
      </mesh>
    </group>
  );
}

export function Tub({ w, h, d, wall, front = "full", body }: { w: number; h: number; d: number; wall: number; front?: "full" | "lip"; body?: number }) {
  const y = h / 2;
  const frontH = front === "lip" ? Math.max(wall * 3.2, h * 0.22) : h;
  const frontY = front === "lip" ? frontH / 2 : y;
  const bodyH = body ?? h;
  const bodyY = bodyH / 2;
  return (
    <group>
      <mesh position={[0, wall / 2, 0]}>
        <boxGeometry args={[w, wall, d]} />
        <Skin />
      </mesh>
      <mesh position={[0, bodyY, -d / 2 + wall / 2]}>
        <boxGeometry args={[w, bodyH, wall]} />
        <Skin />
      </mesh>
      <mesh position={[0, frontY, d / 2 - wall / 2]}>
        <boxGeometry args={[w, frontH, wall]} />
        <Skin />
      </mesh>
      <mesh position={[-w / 2 + wall / 2, bodyY, 0]}>
        <boxGeometry args={[wall, bodyH, d - wall * 2]} />
        <Skin />
      </mesh>
      <mesh position={[w / 2 - wall / 2, bodyY, 0]}>
        <boxGeometry args={[wall, bodyH, d - wall * 2]} />
        <Skin />
      </mesh>
    </group>
  );
}

/** Satin ribbon. Callers pass a ribbon or accent colour; the default is the pull-ribbon red. */
export const RIBBON_COLOR = "#8d1d32";

/** Width of the vertical bands. Shared with the cylinder yaw so the ribbon clears the mark. */
export function ribbonBandWidth(w: number, d: number): number {
  return Math.max(8, Math.min(w, d) * 0.1);
}

/** Radial thickness of a curved band, so the outer arc sits on `radius` and the inner arc stays outside the shell. */
export const RIBBON_ARC_THICKNESS = 0.22;

/** Open arc centred on `yaw`. Eight segments across the band; theta 0 is +Z. */
export function curvedRibbonArc(radius: number, band: number, yaw: number): { theta: number; thetaStart: number; segments: 8 } {
  const theta = band / Math.max(1, radius);
  return { theta, thetaStart: yaw - theta / 2, segments: 8 };
}

/** Satin with dithering so the dark red does not band under ACES. */
function satin(color: string, side: THREE.Side, offset = false) {
  return (
    <meshPhysicalMaterial
      color={color}
      metalness={0.2}
      roughness={0.6}
      envMapIntensity={0.6}
      dithering
      side={side}
      {...(offset ? { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 } : {})}
    />
  );
}

export function Ribbon({ w, h, d, y, color = RIBBON_COLOR, cap = true, across = "z", bend }: {
  w: number;
  h: number;
  d: number;
  y: number;
  color?: string;
  /** Top bar. The lower half of a split ribbon leaves this off. */
  cap?: boolean;
  /** `x` runs the bands over the sides. A rectangular box stays square to its faces. */
  across?: "x" | "z";
  /** Curved band. `flareTo` chamfers the top when the next piece has a different radius. */
  bend?: { radius: number; yaw: number; flareTo?: number };
}) {
  const band = ribbonBandWidth(w, d);
  if (bend) {
    const arc = curvedRibbonArc(bend.radius, band, bend.yaw);
    const flareTo = bend.flareTo;
    const flareH = flareTo != null && Math.abs(flareTo - bend.radius) > 0.12 ? Math.min(1.6, h * 0.35) : 0;
    const bodyH = h - flareH;
    return (
      <group position={[0, y, 0]}>
        {bodyH > 0.2 && (
          <mesh position={[0, bodyH / 2, 0]}>
            <cylinderGeometry args={[bend.radius, bend.radius, bodyH, arc.segments, 1, true, arc.thetaStart, arc.theta]} />
            {satin(color, THREE.DoubleSide, true)}
          </mesh>
        )}
        {flareH > 0.2 && flareTo != null && (
          <mesh position={[0, bodyH + flareH / 2, 0]}>
            <cylinderGeometry args={[flareTo, bend.radius, flareH, arc.segments, 1, true, arc.thetaStart, arc.theta]} />
            {satin(color, THREE.DoubleSide, true)}
          </mesh>
        )}
        {cap && (
          <mesh position={[0, h + 0.3, 0]} rotation={[0, bend.yaw, 0]}>
            <boxGeometry args={[band, 0.45, d]} />
            {satin(color, THREE.FrontSide)}
          </mesh>
        )}
      </group>
    );
  }
  return (
    <group position={[0, y, 0]} rotation={across === "x" ? [0, Math.PI / 2, 0] : undefined}>
      <mesh position={[0, h / 2, d / 2 + 0.3]}>
        <boxGeometry args={[band, h, 0.45]} />
        {satin(color, THREE.FrontSide)}
      </mesh>
      <mesh position={[0, h / 2, -d / 2 - 0.3]}>
        <boxGeometry args={[band, h, 0.45]} />
        {satin(color, THREE.FrontSide)}
      </mesh>
      {cap && (
        <mesh position={[0, h + 0.3, 0]}>
          <boxGeometry args={[band, 0.45, d]} />
          {satin(color, THREE.FrontSide)}
        </mesh>
      )}
    </group>
  );
}

/** Disc radius in XZ, thickness along Y. The flap keeps both inside the board. */
export const MAGNET_RADIUS = 2.3;
export const MAGNET_THICKNESS = 1.15;

export function Magnet({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <mesh position={position} rotation={rotation}>
      <cylinderGeometry args={[MAGNET_RADIUS, MAGNET_RADIUS, MAGNET_THICKNESS, 16]} />
      <meshStandardMaterial color="#2a2d33" metalness={0.86} roughness={0.22} />
    </mesh>
  );
}

export function PullRibbon({ y, z }: { y: number; z: number }) {
  return (
    <mesh position={[0, y, z]} rotation={[0, 0, Math.PI]}>
      <torusGeometry args={[8, 0.85, 10, 28, Math.PI]} />
      <meshStandardMaterial color="#8d1d32" roughness={0.42} />
    </mesh>
  );
}

export function ThumbNotch({ y, z }: { y: number; z: number }) {
  return (
    <mesh position={[0, y, z]} rotation={[Math.PI / 2, 0, 0]}>
      <circleGeometry args={[7.5, 20, Math.PI, Math.PI]} />
      <meshStandardMaterial color="#12141a" roughness={0.92} />
    </mesh>
  );
}

export function PullTab({ w, z, y = 0, x = 0, color, side = false }: {
  w: number;
  z: number;
  y?: number;
  x?: number;
  color?: string;
  /** Thickness along X, so a rectangular lid can carry the tab on a side. */
  side?: boolean;
}) {
  const width = color ? (side ? 0.6 : 10) : Math.min(18, w * 0.22);
  const height = color ? 4 : 7;
  const depth = color ? (side ? 10 : 0.6) : 1.1;
  return (
    <mesh position={[x, y, z]}>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial color={color ?? "#efe6d6"} roughness={color ? 0.45 : 0.72} />
    </mesh>
  );
}

export function OuterSkin({ w, h, d, amount }: { w: number; h: number; d: number; amount: MutableRefObject<number> }) {
  const ref = useRef<THREE.Group>(null);
  const kind = useLab((s) => s.design.box.outerWrap);
  const quality = useLab((s) => s.quality);
  const cutaway = useLab((s) => s.cutaway);
  const color = useLab((s) => s.design.box.wrap?.color ?? "#f4efe6");
  useFrame(() => {
    if (!ref.current) return;
    ref.current.visible = kind !== "none" && amount.current < 0.45;
  });
  if (kind === "none") return null;
  const planes = cutaway ? [sectionPlane] : undefined;
  const pad = kind === "cellophane" ? 1.4 : 2.2;
  const skin = outerWrapMaterialProps(kind, color, quality);
  // Side clearance is pad/2. The top matches it. The bottom sits a hair under the floor so the shell does not z-fight the carton.
  return (
    <group ref={ref}>
      <mesh position={[0, (h + pad / 2) / 2 - 0.01, 0]}>
        <boxGeometry args={[w + pad, h + pad / 2 + 0.02, d + pad]} />
        <meshPhysicalMaterial key={kind} {...skin} clippingPlanes={planes} />
      </mesh>
    </group>
  );
}

export function ClipSync() {
  const ref = useRef<THREE.Group>(null);
  const world = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.getWorldPosition(world);
    sectionPlane.normal.set(-1, 0, 0);
    sectionPlane.constant = world.x;
  });
  return <group ref={ref} />;
}
