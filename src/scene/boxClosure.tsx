import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { logoById } from "../model/catalog.ts";
import type { BoxClosure, BoxForm, InsertMaterial } from "../model/types.ts";
import type { Fit } from "../model/fit.ts";
import { logoTexture } from "../geometry/logos.ts";
import { useLab } from "../store/labStore.ts";
import { FinishMaterial, WrapMaterial } from "./materials.tsx";
import { sectionPlane } from "./sectionPlane.ts";

export const HINGE = {
  lid: "lid",
  flap: "flap",
  spine: "spine",
  sleeve: "sleeve",
  tray: "tray",
} as const;

const INSERT_COLOR: Record<InsertMaterial, string> = {
  eva: "#2c2e33",
  pulp: "#e4d5c0",
  card: "#d5cfc6",
  "velvet-foam": "#5a2433",
};

function Skin({ section = true }: { section?: boolean }) {
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

function BrandMark({ w, y, z }: { w: number; y: number; z: number }) {
  const blueprint = useLab((s) => s.blueprint);
  const text = useLab((s) => s.design.label.text);
  const variantId = useLab((s) => s.design.label.variantId);
  const tex = useMemo(() => {
    const planeW = Math.min(w * 0.48, 52);
    const canvas = logoTexture(logoById(variantId), text, "#f6f1e6", 1024, Math.max(96, Math.round((1024 * 18) / planeW)));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [text, variantId, w]);
  useEffect(() => () => tex.dispose(), [tex]);
  if (blueprint) return null;
  return (
    <mesh position={[0, y, z]}>
      <planeGeometry args={[Math.min(w * 0.48, 52), 18]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
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

function InsertBlock({ fit }: { fit: Fit }) {
  const material = useLab((s) => s.design.box.insert?.material ?? "eva");
  const orientation = useLab((s) => s.design.box.insert?.orientation ?? "standing");
  const cutaway = useLab((s) => s.cutaway);
  const color = INSERT_COLOR[material];
  const velvet = material === "velvet-foam";
  const wall = Math.max(fit.boardMm, 1.2);
  const maxW = Math.max(12, fit.boxW - wall * 2 - 1.2);
  const maxD = Math.max(12, fit.boxD - wall * 2 - 1.2);
  const width = Math.min(fit.insertW, maxW);
  const depth = Math.min(fit.insertD, maxD);
  const well = useWell(width, depth, Math.min(fit.cavityH, fit.boxH * 0.72), fit.cavityW, fit.cavityD);
  const planes = cutaway ? [sectionPlane] : undefined;
  const y0 = wall;
  if (orientation === "lying") {
    const channelW = Math.min(fit.cavityW, width - 6);
    const channelD = Math.min(fit.cavityD, depth - 4);
    const channelH = Math.min(fit.cavityH * 0.62, fit.boxH * 0.45);
    const side = Math.max(3, (width - channelW) / 2);
    const end = Math.max(2.4, (depth - channelD) / 2);
    return (
      <group position={[0, y0, 0]}>
        <mesh position={[0, fit.floorMm / 2, 0]}>
          <boxGeometry args={[width, fit.floorMm, depth]} />
          <meshPhysicalMaterial color={color} roughness={velvet ? 0.8 : 0.9} sheen={velvet ? 1 : 0} sheenColor={color} sheenRoughness={0.4} clippingPlanes={planes} />
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
    <group position={[0, y0, 0]}>
      <mesh position={[0, fit.floorMm / 2, 0]}>
        <boxGeometry args={[width, fit.floorMm, depth]} />
        <meshPhysicalMaterial color={color} roughness={velvet ? 0.78 : 0.92} sheen={velvet ? 1 : 0} sheenColor={color} sheenRoughness={0.42} clippingPlanes={planes} />
      </mesh>
      <mesh geometry={well} position={[0, fit.floorMm, 0]}>
        <meshPhysicalMaterial color={color} roughness={velvet ? 0.8 : 0.9} sheen={velvet ? 1 : 0} sheenColor={color} sheenRoughness={0.4} clippingPlanes={planes} />
      </mesh>
    </group>
  );
}

function Tub({ w, h, d, wall, front = "full" }: { w: number; h: number; d: number; wall: number; front?: "full" | "lip" }) {
  const y = h / 2;
  const frontH = front === "lip" ? Math.max(wall * 3.2, h * 0.22) : h;
  const frontY = front === "lip" ? frontH / 2 : y;
  return (
    <group>
      <mesh position={[0, wall / 2, 0]}>
        <boxGeometry args={[w, wall, d]} />
        <Skin />
      </mesh>
      <mesh position={[0, y, -d / 2 + wall / 2]}>
        <boxGeometry args={[w, h, wall]} />
        <Skin />
      </mesh>
      <mesh position={[0, frontY, d / 2 - wall / 2]}>
        <boxGeometry args={[w, frontH, wall]} />
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

function Ribbon({ w, h, d, y }: { w: number; h: number; d: number; y: number }) {
  const band = Math.max(3.2, Math.min(w, d) * 0.045);
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, h / 2, d / 2 + 0.3]}>
        <boxGeometry args={[band, h, 0.45]} />
        <meshPhysicalMaterial color="#c4a15a" metalness={1} roughness={0.16} />
      </mesh>
      <mesh position={[0, h / 2, -d / 2 - 0.3]}>
        <boxGeometry args={[band, h, 0.45]} />
        <meshPhysicalMaterial color="#c4a15a" metalness={1} roughness={0.16} />
      </mesh>
      <mesh position={[0, h + 0.3, 0]}>
        <boxGeometry args={[band, 0.45, d]} />
        <meshPhysicalMaterial color="#c4a15a" metalness={1} roughness={0.16} />
      </mesh>
    </group>
  );
}

function PullTab({ w, z }: { w: number; z: number }) {
  return (
    <mesh position={[0, 0, z]}>
      <boxGeometry args={[Math.min(18, w * 0.22), 7, 1.1]} />
      <meshStandardMaterial color="#efe6d6" roughness={0.72} />
    </mesh>
  );
}

function OuterSkin({ w, h, d, amount }: { w: number; h: number; d: number; amount: MutableRefObject<number> }) {
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
  return (
    <group ref={ref}>
      <mesh>
        <boxGeometry args={[w + pad, h + pad, d + pad]} />
        {kind === "cellophane" ? (
          <meshPhysicalMaterial
            color="#f7f8f4"
            transparent
            opacity={quality === "high" ? 0.18 : 0.22}
            roughness={0.06}
            metalness={0}
            transmission={quality === "high" ? 0.9 : 0}
            thickness={0.35}
            ior={1.46}
            depthWrite={false}
            clippingPlanes={planes}
          />
        ) : (
          <meshPhysicalMaterial
            color={kind === "tissue" ? "#f3ecdf" : color}
            transparent
            opacity={kind === "tissue" ? 0.55 : 0.96}
            roughness={kind === "tissue" ? 0.95 : 0.78}
            metalness={0}
            clippingPlanes={planes}
          />
        )}
      </mesh>
    </group>
  );
}

function ClipSync() {
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

export function ClosureBox({ form, fit }: { form: BoxForm; fit: Fit }) {
  const closure = useLab((s) => s.design.box.closure ?? "lift-off") as BoxClosure;
  const ribbonOn = useLab((s) => s.design.box.ribbon === true);
  const pull = useLab((s) => s.design.box.pullTab === true);
  const stage = useLab((s) => s.stage);
  const open = useLab((s) => s.boxOpen);
  const w = fit.boxW;
  const h = fit.boxH;
  const d = fit.boxD;
  const wall = Math.max(fit.boardMm, 1.2);
  const baseH = closure === "lift-off" ? h * 0.74 : h * 0.68;
  const lidT = Math.max(wall * 2.8, 7);
  const flapH = baseH * 0.9;
  const lid = useRef<THREE.Group>(null);
  const flap = useRef<THREE.Group>(null);
  const sleeve = useRef<THREE.Group>(null);
  const tray = useRef<THREE.Group>(null);
  const amount = useRef(0);

  const applyPose = (a: number) => {
    if (lid.current) {
      // Raised, not folded flat behind the body, so the hinge reads from the studio camera.
      lid.current.rotation.x = closure === "magnetic" ? -1.22 * a : 0;
      lid.current.rotation.z = closure === "book" ? 1.35 * a : 0;
      if (closure === "lift-off") {
        lid.current.position.y = baseH - 8 + a * h * 0.62;
        lid.current.position.z = a * d * 0.32;
      } else if (closure !== "book") {
        lid.current.position.z = closure === "magnetic" ? -d / 2 : lid.current.position.z;
      }
    }
    if (flap.current) flap.current.rotation.x = (Math.PI / 2) * (1 - a) + 0.18 * a;
    if (sleeve.current && closure === "sleeve") {
      sleeve.current.position.y = h / 2 + a * h * 0.86;
      sleeve.current.position.z = -a * d * 0.06;
    }
    if (tray.current && closure === "drawer") tray.current.position.z = a * d * 0.92;
  };

  useLayoutEffect(() => {
    const live = stage !== "bottle" && open ? 1 : 0;
    amount.current = live;
    applyPose(live);
  }, [stage, open, closure, h, d, baseH]);

  useFrame((_, dt) => {
    const live = stage !== "bottle" && open ? 1 : 0;
    amount.current = THREE.MathUtils.damp(amount.current, live, 5.5, dt);
    applyPose(amount.current);
  });

  const outer = <OuterSkin w={w} h={h} d={d} amount={amount} />;

  if (closure === "sleeve") {
    const innerW = w - wall * 1.6;
    const innerD = d - wall * 1.6;
    const innerH = h * 0.9;
    return (
      <group>
        <ClipSync />
        <group>
          <Tub w={innerW} h={innerH} d={innerD} wall={wall} />
          <InsertBlock fit={fit} />
          <BrandMark w={innerW} y={innerH * 0.42} z={innerD / 2 + 0.4} />
        </group>
        <group ref={sleeve} userData={{ hinge: HINGE.sleeve }} position={[0, h / 2, 0]}>
          <mesh position={[0, 0, -d / 2 + wall / 2]}><boxGeometry args={[w, h, wall]} /><Skin /></mesh>
          <mesh position={[0, 0, d / 2 - wall / 2]}><boxGeometry args={[w, h, wall]} /><Skin /></mesh>
          <mesh position={[-w / 2 + wall / 2, 0, 0]}><boxGeometry args={[wall, h, d]} /><Skin /></mesh>
          <mesh position={[w / 2 - wall / 2, 0, 0]}><boxGeometry args={[wall, h, d]} /><Skin /></mesh>
          {pull && <PullTab w={w} z={d / 2 + 0.8} />}
          {ribbonOn && <Ribbon w={w} h={h * 0.5} d={d} y={-h * 0.15} />}
        </group>
        {outer}
      </group>
    );
  }

  if (closure === "drawer") {
    const trayH = h * 0.42;
    return (
      <group>
        <ClipSync />
        <group ref={sleeve} userData={{ hinge: HINGE.sleeve }}>
          <mesh position={[0, h / 2, -d / 2 + wall / 2]}><boxGeometry args={[w, h, wall]} /><Skin /></mesh>
          <mesh position={[-w / 2 + wall / 2, h / 2, 0]}><boxGeometry args={[wall, h, d]} /><Skin /></mesh>
          <mesh position={[w / 2 - wall / 2, h / 2, 0]}><boxGeometry args={[wall, h, d]} /><Skin /></mesh>
          <mesh position={[0, h - wall / 2, 0]}><boxGeometry args={[w - wall * 2, wall, d - wall]} /><Skin /></mesh>
          <mesh position={[0, wall / 2, 0]}><boxGeometry args={[w, wall, d]} /><Skin /></mesh>
          {ribbonOn && <Ribbon w={w} h={h * 0.55} d={d} y={h * 0.22} />}
        </group>
        <group ref={tray} userData={{ hinge: HINGE.tray }}>
          <mesh position={[0, trayH / 2 + wall, 0]}>
            <boxGeometry args={[w - wall * 3, trayH, d - wall * 2.4]} />
            <Skin />
          </mesh>
          <InsertBlock fit={fit} />
          {pull && <PullTab w={w} z={d / 2 - wall} />}
          <BrandMark w={w} y={trayH * 0.7} z={d / 2 - wall * 0.2} />
        </group>
        {outer}
      </group>
    );
  }

  if (closure === "book") {
    return (
      <group>
        <ClipSync />
        <Tub w={w - wall} h={h - wall * 2} d={d - wall} wall={wall} />
        <InsertBlock fit={fit} />
        <group ref={lid} userData={{ hinge: HINGE.spine }} position={[-w / 2, h, 0]}>
          <mesh position={[wall / 2, -h / 2, 0]}>
            <boxGeometry args={[wall * 1.4, h, d]} />
            <Skin />
          </mesh>
          <RoundedBox args={[w, lidT, d]} radius={1.4} smoothness={4} position={[w / 2, -lidT / 2, 0]}>
            <Skin />
          </RoundedBox>
          <BrandMark w={w} y={-h * 0.42} z={d / 2 + 0.5} />
        </group>
        {ribbonOn && <Ribbon w={w} h={h * 0.4} d={d} y={h * 0.3} />}
        {outer}
      </group>
    );
  }

  if (closure === "lift-off") {
    const lidH = Math.max(h * 0.28, 18);
    const shoulder = 12;
    return (
      <group>
        <ClipSync />
        <Tub w={w} h={baseH} d={d} wall={wall} />
        <mesh position={[0, baseH - shoulder / 2, 0]}>
          <boxGeometry args={[w - wall * 3.2, shoulder, d - wall * 3.2]} />
          <Skin />
        </mesh>
        <InsertBlock fit={fit} />
        {form === "window" && (
          <mesh position={[0, baseH * 0.55, d / 2 + 0.2]}>
            <planeGeometry args={[w * 0.56, baseH * 0.42]} />
            <meshPhysicalMaterial color="#d5dde6" roughness={0.05} transmission={0.65} thickness={0.6} ior={1.5} transparent opacity={0.35} />
          </mesh>
        )}
        <group ref={lid} userData={{ hinge: HINGE.lid }} position={[0, baseH - 8, 0]}>
          <RoundedBox args={[w + 0.6, lidH, d + 0.6]} radius={1.6} smoothness={4} position={[0, lidH / 2, 0]}>
            <Skin />
          </RoundedBox>
          {pull && <PullTab w={w} z={d / 2 + 0.9} />}
        </group>
        <BrandMark w={w} y={baseH * 0.48} z={d / 2 + 0.55} />
        {ribbonOn && <Ribbon w={w} h={h * 0.42} d={d} y={h * 0.28} />}
        {outer}
      </group>
    );
  }

  return (
    <group>
      <ClipSync />
      <Tub w={w} h={baseH} d={d} wall={wall} front="lip" />
      <InsertBlock fit={fit} />
      <group ref={lid} userData={{ hinge: HINGE.lid }} position={[0, baseH, -d / 2]}>
        <RoundedBox args={[w, lidT, d]} radius={1.3} smoothness={4} position={[0, lidT / 2, d / 2]}>
          <Skin />
        </RoundedBox>
        <group ref={flap} userData={{ hinge: HINGE.flap }} position={[0, 0, d]}>
          <mesh position={[0, wall / 2, flapH / 2]}>
            <boxGeometry args={[w, wall * 1.6, flapH]} />
            <Skin />
          </mesh>
          <BrandMark w={w} y={wall + 0.35} z={flapH * 0.55} />
        </group>
      </group>
      {ribbonOn && <Ribbon w={w} h={baseH * 0.55} d={d} y={baseH * 0.2} />}
      {outer}
    </group>
  );
}
