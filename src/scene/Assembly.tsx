import { useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Outlines, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { bottleById, boxById, capById, collarById, logoById, pumpById } from "../model/catalog.ts";
import { computeFit } from "../model/fit.ts";
import { isGlass } from "../model/materials.ts";
import type { BoxForm, PartKey, PumpStyle } from "../model/types.ts";
import { buildBottleGeometry, buildCapGeometry, curvedPlate } from "../geometry/sweep.ts";
import { logoTexture } from "../geometry/logos.ts";
import { useLab } from "../store/labStore.ts";
import { partLabel } from "../i18n/copy.ts";
import { FinishMaterial } from "./materials.tsx";
import { PartGuides } from "./Guides.tsx";
import { Clock } from "./clock.ts";


function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

function PartShell({
  part,
  index,
  home,
  explode,
  visible,
  variantKey,
  size = "",
  children,
}: {
  part: PartKey;
  index: number;
  home: [number, number, number];
  explode: [number, number, number];
  visible: boolean;
  variantKey: string;
  size?: string;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const clock = useContext(Clock);
  const pop = useRef(1);
  const lang = useLab((s) => s.lang);
  const exploded = useLab((s) => s.explode) > 0.08;
  const hot = useHot(part);
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: "#e7d3ae", transparent: true, opacity: 0.45 });
    const object = new THREE.Line(geometry, material);
    object.visible = false;
    return object;
  }, []);

  useEffect(() => {
    pop.current = 0.9;
  }, [variantKey]);

  useLayoutEffect(() => {
    ref.current?.position.set(home[0], home[1], home[2]);
    ref.current?.scale.setScalar(visible ? 1 : 0.001);
    // Mount only — useFrame owns the pose after this, and `home` is a fresh array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, dt) => {
    const group = ref.current;
    if (!group) return;
    const local = smooth(index * 0.07, index * 0.07 + 0.5, clock.current);
    pop.current = THREE.MathUtils.damp(pop.current, 1, 7, dt);
    const shown = visible ? pop.current : 0.001;
    const scale = THREE.MathUtils.damp(group.scale.x || shown, shown, 8, dt);
    group.scale.setScalar(Math.max(0.001, scale));
    group.visible = scale > 0.02;
    group.position.set(home[0] + explode[0] * local, home[1] + explode[1] * local, home[2] + explode[2] * local);
    const positions = line.geometry.getAttribute("position");
    const array = positions.array as Float32Array;
    array[0] = -explode[0] * local;
    array[1] = -explode[1] * local;
    array[2] = -explode[2] * local;
    array[3] = 0;
    array[4] = 0;
    array[5] = 0;
    positions.needsUpdate = true;
    line.visible = local > 0.12 && (explode[0] !== 0 || explode[1] !== 0 || explode[2] !== 0);
    (line.material as THREE.LineBasicMaterial).opacity = Math.min(0.55, local);
  });

  const select = useLab((s) => s.select);
  const hover = useLab((s) => s.hover);
  const down = useRef({ x: 0, y: 0 });

  return (
    <group
      ref={ref}
      onPointerOver={(event) => {
        event.stopPropagation();
        hover(part, event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        hover(part, event.clientX, event.clientY);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        hover(null);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        down.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (Math.hypot(event.clientX - down.current.x, event.clientY - down.current.y) > 6) return;
        select(part);
      }}
    >
      <primitive object={line} />
      {children}
      {exploded && (
        <Html position={[0, 10, 0]} center distanceFactor={240} zIndexRange={[12, 0]} style={{ pointerEvents: "none" }}>
          <div className={`explode-tag ${hot === "selected" ? "is-sel" : ""}`}>
            <b>{partLabel[lang][part]}</b>
            {size && <span dir="ltr">{size}</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

function useHot(part: PartKey): "selected" | "hover" | null {
  const selected = useLab((s) => s.selected);
  const hovered = useLab((s) => s.hovered?.part ?? null);
  if (selected === part) return "selected";
  if (hovered === part) return "hover";
  return null;
}

function HotOutline({ part }: { part: PartKey }) {
  const hot = useHot(part);
  if (!hot) return null;
  return <Outlines thickness={hot === "selected" ? 3.4 : 2} color="#e7d3ae" screenspace toneMapped={false} />;
}

function useDisposable<T extends { dispose: () => void }>(factory: () => T, deps: unknown[]): T {
  const value = useMemo(factory, deps);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

export function Assembly() {
  const design = useLab((s) => s.design);
  const explode = useLab((s) => s.explode);
  const clock = useRef(0);
  const fit = useMemo(() => computeFit(design, explode > 0.45), [design, explode]);

  useFrame((_, dt) => {
    clock.current = THREE.MathUtils.damp(clock.current, explode, 1.7, dt);
  });

  return (
    <Clock.Provider value={clock}>
      <BoxPart />
      <BottlePart />
      <LiquidPart />
      <LabelPart />
      <CollarPart />
      <PumpPart />
      <CapPart />
      <PartGuides />
      <pointLight position={[0, 6, 18]} intensity={0.35} color="#e7c48a" distance={90} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
        <ringGeometry args={[18, 36, 64]} />
        <meshBasicMaterial color="#d4b48a" transparent opacity={0.08} />
      </mesh>
      <Shadow fitWidth={fit.bottleW} />
    </Clock.Provider>
  );
}

function Shadow({ fitWidth }: { fitWidth: number }) {
  const map = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    gradient.addColorStop(0, "rgba(0,0,0,0.55)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    return texture;
  }, []);
  if (!map) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
      <planeGeometry args={[fitWidth * 1.8, fitWidth * 1.35]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} />
    </mesh>
  );
}

function BottlePart() {
  const design = useLab((s) => s.design);
  const spec = bottleById(design.bottle.variantId);
  const fit = computeFit(design, false);
  const geo = useDisposable(
    () =>
      buildBottleGeometry({
        height: design.bottle.heightMm,
        width: design.bottle.widthMm,
        depth: design.bottle.depthMm,
        section: spec.section,
        softness: spec.softness,
        faceted: spec.faceted,
        neckR: fit.neckR,
        profile: spec.profile,
        shoulder: spec.shoulder,
      }),
    [design.bottle.heightMm, design.bottle.widthMm, design.bottle.depthMm, design.bottle.neck, spec],
  );
  return (
    <PartShell part="bottle" index={5} home={[0, 0, 0]} explode={[0, 0, 0]} visible={design.bottle.visible} variantKey={spec.id} size={`${design.bottle.widthMm.toFixed(1)}×${design.bottle.depthMm.toFixed(1)}×${design.bottle.heightMm.toFixed(1)}`}>
      <mesh geometry={geo} renderOrder={2}>
        <FinishMaterial finish={design.bottle.finish} color={design.bottle.color} flat={spec.faceted} glass />
        <HotOutline part="bottle" />
      </mesh>
    </PartShell>
  );
}

function LiquidPart() {
  const design = useLab((s) => s.design);
  const spec = bottleById(design.bottle.variantId);
  const fit = computeFit(design, false);
  const geo = useDisposable(
    () =>
      buildBottleGeometry({
        height: design.bottle.heightMm,
        width: design.bottle.widthMm,
        depth: design.bottle.depthMm,
        section: spec.section,
        softness: spec.softness,
        faceted: spec.faceted,
        neckR: Math.max(3, fit.neckR - 1.2),
        profile: spec.profile,
        shoulder: spec.shoulder,
        inset: 2.3,
        closedTop: true,
      }),
    [design.bottle.heightMm, design.bottle.widthMm, design.bottle.depthMm, design.bottle.neck, spec],
  );
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), []);
  const surface = 3 + design.liquid.fill * Math.max(10, design.bottle.heightMm * (0.78 - spec.shoulder * 0.25));
  useFrame(() => {
    plane.constant = surface;
  });
  const rx = Math.max(4, design.bottle.widthMm / 2 - 4);
  const rz = Math.max(4, design.bottle.depthMm / 2 - 4);
  return (
    <PartShell part="liquid" index={5} home={[0, 0, 0]} explode={[0, 0, 0]} visible={design.liquid.visible && design.bottle.visible} variantKey={spec.id + design.liquid.color}>
      <mesh geometry={geo} renderOrder={1}>
        <meshPhysicalMaterial
          color={design.liquid.color}
          transmission={0.18}
          thickness={20}
          roughness={0.12}
          metalness={0}
          ior={1.36}
          attenuationColor={design.liquid.color}
          attenuationDistance={3.5}
          transparent
          clippingPlanes={[plane]}
          clipShadows
        />
      </mesh>
      <mesh position={[0, surface, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, rz / rx, 1]} renderOrder={1}>
        <circleGeometry args={[rx, 40]} />
        <meshPhysicalMaterial color={design.liquid.color} roughness={0.04} metalness={0.02} transmission={0.2} transparent opacity={0.92} />
      </mesh>
    </PartShell>
  );
}

function CapPart() {
  const design = useLab((s) => s.design);
  const spec = capById(design.cap.variantId);
  const fit = computeFit(design, false);
  const geo = useDisposable(
    () => buildCapGeometry(spec.profile, spec.section, fit.capH, fit.capW, fit.capD, spec.softness, spec.faceted, fit.collarOuter + 0.3),
    [spec, fit.capH, fit.capW, fit.capD, fit.collarOuter],
  );
  const glass = isGlass(design.cap.finish);
  return (
    <PartShell part="cap" index={1} home={[0, fit.capBottom, 0]} explode={[0, 62, 0]} visible={design.cap.visible} variantKey={spec.id} size={`${fit.capW.toFixed(1)}×${fit.capH.toFixed(1)}`}>
      <mesh geometry={geo}>
        <FinishMaterial finish={design.cap.finish} color={design.cap.color} flat={spec.faceted} glass={glass} />
        <HotOutline part="cap" />
      </mesh>
    </PartShell>
  );
}

function CollarPart() {
  const design = useLab((s) => s.design);
  const spec = collarById(design.collar.variantId);
  const fit = computeFit(design, false);
  const y = fit.collarHeight / 2;
  return (
    <PartShell part="collar" index={3} home={[0, fit.collarBottom, 0]} explode={[0, 16, 0]} visible={design.collar.visible} variantKey={spec.id + design.bottle.neck} size={`Ø${(fit.collarOuter * 2).toFixed(1)}`}>
      <mesh position={[0, y, 0]}>
        <cylinderGeometry args={[fit.collarOuter, fit.collarOuter - spec.flareMm * 0.15, fit.collarHeight, spec.knurl ? 18 : 48, 1]} />
        <FinishMaterial finish={design.collar.finish} color={design.collar.color} flat={spec.knurl} />
        <HotOutline part="collar" />
      </mesh>
      {Array.from({ length: spec.rings }, (_, index) => (
        <mesh key={index} position={[0, 1.2 + (index * (fit.collarHeight - 2)) / Math.max(1, spec.rings), 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[fit.collarOuter + 0.15, 0.28, 8, 32]} />
          <FinishMaterial finish={design.collar.finish} color={design.collar.color} />
        </mesh>
      ))}
      {spec.flareMm > 0.4 && (
        <mesh position={[0, fit.collarHeight - 0.8, 0]}>
          <cylinderGeometry args={[fit.collarOuter + spec.flareMm, fit.collarOuter, 1.6, 40]} />
          <FinishMaterial finish={design.collar.finish} color={design.collar.color} />
        </mesh>
      )}
    </PartShell>
  );
}

function PumpPart() {
  const design = useLab((s) => s.design);
  const spec = pumpById(design.pump.variantId);
  const exploded = useLab((s) => s.explode) > 0.45;
  const fit = computeFit(design, exploded || !design.cap.visible);
  const tube = useDisposable(() => {
    const length = Math.max(18, fit.pumpBase - 8);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.7, -length * 0.45, 0.5),
      new THREE.Vector3(-0.35, -length, -0.25),
    ]);
    return new THREE.TubeGeometry(curve, 28, 0.72, 8, false);
  }, [fit.pumpBase]);
  return (
    <PartShell part="pump" index={2} home={[0, fit.pumpBase, 0]} explode={[0, 36, 0]} visible={design.pump.visible} variantKey={spec.id} size={`Ø${(fit.actuatorR * 2).toFixed(1)}`}>
      <mesh geometry={tube} position={[0, -1, 0]}>
        <meshPhysicalMaterial color={design.pump.color} metalness={0.55} roughness={0.32} />
      </mesh>
      <Actuator style={spec.style} height={fit.actuatorH} radius={fit.actuatorR} nozzle={fit.nozzle} finish={design.pump.finish} color={design.pump.color} />
    </PartShell>
  );
}

function Actuator({
  style,
  height,
  radius,
  nozzle,
  finish,
  color,
}: {
  style: PumpStyle;
  height: number;
  radius: number;
  nozzle: number;
  finish: Parameters<typeof FinishMaterial>[0]["finish"];
  color: string;
}) {
  const r = radius;
  const h = height;
  return (
    <group>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[r * 0.55, r * 0.7, 1.4, 24]} />
        <FinishMaterial finish={finish} color={color} />
      </mesh>
      {style === "dome" || style === "soft" ? (
        <mesh position={[0, h * 0.55, 0]} scale={[1, style === "soft" ? 0.8 : 0.9, 1]}>
          <sphereGeometry args={[r, 32, 24]} />
          <FinishMaterial finish={finish} color={color} />
          <HotOutline part="pump" />
        </mesh>
      ) : (
        <mesh position={[0, h / 2, 0]}>
          <cylinderGeometry args={[style === "flat" ? r * 1.15 : r, style === "shroud" ? r * 1.05 : r * 0.92, h, style === "screw" ? 20 : 36]} />
          <FinishMaterial finish={finish} color={color} />
          <HotOutline part="pump" />
        </mesh>
      )}
      {style === "screw" &&
        [0, 1, 2].map((index) => (
          <mesh key={index} position={[0, 1.6 + index * 1.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r * 0.95, 0.22, 6, 24]} />
            <FinishMaterial finish={finish} color={color} />
          </mesh>
        ))}
      <mesh position={[r * 0.2, h * 0.55, r * 0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.7, 0.9, nozzle, 10]} />
        <FinishMaterial finish={finish} color={color} />
      </mesh>
    </group>
  );
}

function LabelPart() {
  const design = useLab((s) => s.design);
  const bottle = bottleById(design.bottle.variantId);
  const spec = logoById(design.label.variantId);
  const fit = computeFit(design, false);
  const ink = useMemo(() => inkFor(spec.application, design.label.color), [spec.application, design.label.color]);
  const canvas = useMemo(() => logoTexture(spec, design.label.text, ink, 512), [spec, design.label.text, ink]);
  const texture = useMemo(() => {
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
    return map;
  }, [canvas]);
  useEffect(() => () => texture.dispose(), [texture]);
  const round = bottle.section === "circle" || bottle.section === "pebble";
  const plate = useDisposable(() => {
    if (spec.plate === "band" && round) return curvedPlate(fit.labelW, fit.labelH, design.bottle.depthMm / 2);
    if (spec.plate === "circle") return new THREE.CircleGeometry(Math.min(fit.labelW, fit.labelH) / 2, 40);
    if (spec.plate === "diamond") {
      const shape = new THREE.Shape();
      shape.moveTo(0, fit.labelH / 2);
      shape.lineTo(fit.labelW / 2, 0);
      shape.lineTo(0, -fit.labelH / 2);
      shape.lineTo(-fit.labelW / 2, 0);
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    }
    return new THREE.PlaneGeometry(fit.labelW, fit.labelH);
  }, [spec.plate, fit.labelW, fit.labelH, round, design.bottle.depthMm]);
  const z = spec.plate === "band" && round ? design.bottle.depthMm / 2 + 0.4 : fit.labelZ;
  return (
    <PartShell part="label" index={4} home={[0, fit.labelY, z]} explode={[0, 0, 42]} visible={design.label.visible} variantKey={spec.id + design.label.text} size={design.label.text}>
      <mesh geometry={plate} renderOrder={3}>
        <meshPhysicalMaterial
          color={design.label.color}
          metalness={spec.application === "foil" ? 0.62 : spec.application === "emboss" ? 0.34 : 0.12}
          roughness={spec.application === "foil" ? 0.32 : 0.48}
          envMapIntensity={0.55}
          clearcoat={spec.application === "foil" ? 0.4 : 0.08}
          clearcoatRoughness={0.35}
        />
        <HotOutline part="label" />
      </mesh>
      <mesh geometry={plate} position={[0, 0, 0.35]} renderOrder={4}>
        <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped />
      </mesh>
    </PartShell>
  );
}

function relativeLuminance(hex: string): number {
  const color = new THREE.Color(hex);
  const lin = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(color.r) + 0.7152 * lin(color.g) + 0.0722 * lin(color.b);
}

function inkFor(application: string, plate: string): string {
  const lum = relativeLuminance(plate);
  if (application === "foil") return "#fff6e4";
  if (application === "emboss") return lum > 0.62 ? "#6d583c" : "#f6f1e6";
  if (application === "engrave") return lum > 0.45 ? "#241c14" : "#0c0b0a";
  return lum > 0.55 ? "#221910" : "#f4eee4";
}

function BoxPart() {
  const design = useLab((s) => s.design);
  const spec = boxById(design.box.variantId);
  const fit = computeFit(design, false);
  return (
    <PartShell part="box" index={0} home={[fit.boxX, 0, fit.boxZ]} explode={fit.explode.box} visible={design.box.visible} variantKey={spec.id} size={`${fit.boxW.toFixed(0)}×${fit.boxH.toFixed(0)}`}>
      <BoxFormMesh form={spec.form} w={fit.boxW} h={fit.boxH} d={fit.boxD} finish={design.box.finish} color={design.box.color} />
    </PartShell>
  );
}

function BoxFormMesh({
  form,
  w,
  h,
  d,
  finish,
  color,
}: {
  form: BoxForm;
  w: number;
  h: number;
  d: number;
  finish: Parameters<typeof FinishMaterial>[0]["finish"];
  color: string;
}) {
  const wall = 1.6;
  if (form === "tube") {
    return (
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[Math.min(w, d) / 2, Math.min(w, d) / 2, h, 48, 1, true]} />
        <FinishMaterial finish={finish} color={color} />
        <HotOutline part="box" />
      </mesh>
    );
  }
  if (form === "plinth") {
    return (
      <RoundedBox args={[w, Math.max(16, h * 0.18), d]} radius={1.2} smoothness={3} position={[0, 8, 0]}>
        <FinishMaterial finish={finish} color={color} />
        <HotOutline part="box" />
      </RoundedBox>
    );
  }
  if (form === "sleeve") {
    return (
      <group position={[0, h / 2, 0]}>
        <mesh position={[0, 0, -d / 2 + wall / 2]}><boxGeometry args={[w, h, wall]} /><FinishMaterial finish={finish} color={color} /><HotOutline part="box" /></mesh>
        <mesh position={[-w / 2 + wall / 2, 0, 0]}><boxGeometry args={[wall, h, d]} /><FinishMaterial finish={finish} color={color} /></mesh>
        <mesh position={[w / 2 - wall / 2, 0, 0]}><boxGeometry args={[wall, h, d]} /><FinishMaterial finish={finish} color={color} /></mesh>
      </group>
    );
  }
  const lidOpen = form === "magnetic" || form === "coffret" ? 0.85 : form === "rigid" ? 0.22 : 0;
  const baseH = form === "drawer" ? h * 0.78 : h * (form === "window" ? 1 : 0.72);
  return (
    <group>
      <RoundedBox args={[w, baseH, d]} radius={1.4} smoothness={3} position={[0, baseH / 2, 0]}>
        <FinishMaterial finish={finish} color={color} />
        <HotOutline part="box" />
      </RoundedBox>
      {form === "rigid" && (
        <mesh position={[0, baseH * 0.62, 0]}>
          <boxGeometry args={[w + 0.5, 1.5, d + 0.5]} />
          <meshStandardMaterial color="#D6B26A" metalness={0.82} roughness={0.28} />
        </mesh>
      )}
      {form === "window" && (
        <mesh position={[0, baseH * 0.55, d / 2 + 0.2]}>
          <planeGeometry args={[w * 0.62, baseH * 0.48]} />
          <meshPhysicalMaterial color="#d4b48a" metalness={0.8} roughness={0.3} transparent opacity={0.35} />
        </mesh>
      )}
      {form === "drawer" && (
        <RoundedBox args={[w * 0.9, baseH * 0.42, d * 0.92]} radius={0.8} smoothness={2} position={[w * 0.28, baseH * 0.28, 0]}>
          <FinishMaterial finish={finish} color={color} />
        </RoundedBox>
      )}
      {lidOpen > 0 && (
        <group position={[0, baseH, -d / 2]} rotation={[lidOpen, 0, 0]}>
          <RoundedBox args={[w, form === "coffret" ? h * 0.34 : h * 0.28, d]} radius={1.2} smoothness={3} position={[0, (form === "coffret" ? h * 0.34 : h * 0.28) / 2, d / 2]}>
            <FinishMaterial finish={finish} color={color} />
          </RoundedBox>
        </group>
      )}
      <mesh position={[0, baseH + 0.3, d / 2 + 0.3]}>
        <planeGeometry args={[w * 0.7, 0.45]} />
        <meshBasicMaterial color="#d4b48a" />
      </mesh>
    </group>
  );
}
