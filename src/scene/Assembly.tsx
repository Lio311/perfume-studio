import { useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { bottleById, boxById, capById, collarById, logoById, pumpById } from "../model/catalog.ts";
import { computeFit } from "../model/fit.ts";
import { isGlass } from "../model/materials.ts";
import type { BoxForm, PartKey, PumpStyle } from "../model/types.ts";
import { buildBottleGeometry, buildCapGeometry, buildLabelPatch } from "../geometry/sweep.ts";
import { logoTexture } from "../geometry/logos.ts";
import { useLab } from "../store/labStore.ts";
import { latheGeometry, latheProfile } from "../import/lathe.ts";
import { clickPart, doubleClickPart, markPartPointer, swapFlashOn } from "./focusClick.ts";
import { FinishMaterial } from "./materials.tsx";
import { Callouts } from "./Callouts.tsx";
import { explodeLocal } from "./explodeCurve.ts";
import { PartGuides, posedFrame, turntableHome } from "./Guides.tsx";
import { HoloShell } from "./voiceScenery.tsx";
import { Clock } from "./clock.ts";

function PartShell({
  part,
  index,
  home,
  explode,
  visible,
  variantKey,
  children,
}: {
  part: PartKey;
  index: number;
  home: [number, number, number];
  explode: [number, number, number];
  visible: boolean;
  variantKey: string;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const clock = useContext(Clock);
  const pop = useRef(1);
  const slide = useRef(0);
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: "#e7d3ae", transparent: true, opacity: 0.45 });
    const object = new THREE.Line(geometry, material);
    object.visible = false;
    return object;
  }, []);

  useEffect(() => {
    pop.current = 1.04;
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
    const state = useLab.getState();
    const isolated = state.solo === part;
    const faded = Boolean(state.solo) && state.solo !== part;
    const ghost = Boolean(state.aimed && state.selected && state.selected !== part && !state.solo);
    const local = isolated ? 0 : explodeLocal(index, clock.current);
    pop.current = THREE.MathUtils.damp(pop.current, 1, 6, dt);
    const shown = visible && !faded ? pop.current : 0.001;
    const scale = THREE.MathUtils.damp(group.scale.x || shown, shown, faded || isolated ? 4 : 8, dt);
    group.scale.setScalar(Math.max(0.001, scale));
    group.visible = scale > 0.02;
    const focusSlide = state.aimed && state.selected === part && !isolated ? 1 : 0;
    slide.current = THREE.MathUtils.damp(slide.current, focusSlide, 5, dt);
    const span = Math.hypot(explode[0], explode[1], explode[2]);
    const sx = span > 0.5 ? explode[0] / span : 0;
    const sy = span > 0.5 ? explode[1] / span : 1;
    const sz = span > 0.5 ? explode[2] / span : 0;
    const nudge = 12 * slide.current;
    let tx = home[0] + explode[0] * local + sx * nudge;
    let ty = home[1] + explode[1] * local + sy * nudge;
    let tz = home[2] + explode[2] * local + sz * nudge;
    if (isolated) {
      const fit = computeFit(state.design, false);
      const frame = posedFrame(part, fit, state.stage);
      const park = turntableHome(frame);
      tx = park[0];
      ty = park[1];
      tz = park[2];
    }
    const yaw = isolated ? 0 : local * 0.14 * (index % 2 === 0 ? 1 : -1);
    group.rotation.y = THREE.MathUtils.damp(group.rotation.y, yaw, 5, dt);
    const gap = (group.position.x - tx) ** 2 + (group.position.y - ty) ** 2 + (group.position.z - tz) ** 2;
    if (gap > 1) {
      group.position.x = THREE.MathUtils.damp(group.position.x, tx, 5, dt);
      group.position.y = THREE.MathUtils.damp(group.position.y, ty, 5, dt);
      group.position.z = THREE.MathUtils.damp(group.position.z, tz, 5, dt);
    } else {
      group.position.set(tx, ty, tz);
    }
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
    const ghostTarget = ghost ? 0.1 : 1;
    group.traverse((obj) => {
      let node: THREE.Object3D | null = obj;
      let solid = false;
      while (node) {
        if (node.userData.keepSolid) { solid = true; break; }
        node = node.parent;
      }
      const mesh = obj as THREE.Mesh;
      if (solid || !mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const shader = mat as THREE.ShaderMaterial;
        if (shader.uniforms?.uFade) {
          shader.uniforms.uFade.value = THREE.MathUtils.damp(shader.uniforms.uFade.value, ghostTarget, 7, dt);
          mat.transparent = true;
          mat.depthWrite = shader.uniforms.uFade.value > 0.55;
          continue;
        }
        if (mat.userData.baseOpacity === undefined) mat.userData.baseOpacity = mat.opacity;
        const target = ghost ? 0.1 : (mat.userData.baseOpacity as number);
        mat.transparent = ghost || (mat.userData.baseOpacity as number) < 0.999;
        mat.opacity = THREE.MathUtils.damp(mat.opacity, target, 7, dt);
        mat.depthWrite = mat.opacity > 0.5;
      }
    });
  });

  const hover = useLab((s) => s.hover);
  const down = useRef({ x: 0, y: 0 });

  return (
    <group
      ref={ref}
      userData={{ part }}
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
        markPartPointer();
        down.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (Math.hypot(event.clientX - down.current.x, event.clientY - down.current.y) > 6) return;
        clickPart(part);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        doubleClickPart(part);
      }}
    >
      <primitive object={line} />
      {children}
    </group>
  );
}

function GoldRim({ part, stamp }: { part: PartKey; stamp: string }) {
  const ref = useRef<THREE.Group>(null);
  const built = useRef("");
  useLayoutEffect(() => {
    built.current = "";
  }, [stamp]);
  useFrame(() => {
    const group = ref.current;
    const mesh = group?.parent as THREE.Mesh | undefined;
    if (!group || !mesh?.geometry) return;
    if (built.current !== stamp) {
      built.current = stamp;
      for (const child of group.children) {
        const line = child as THREE.LineSegments;
        if (line.geometry && line.geometry !== mesh.geometry) line.geometry.dispose();
        const material = (child as THREE.Mesh).material as THREE.Material | undefined;
        material?.dispose();
      }
      group.clear();
      const hull = new THREE.Mesh(
        mesh.geometry,
        new THREE.MeshBasicMaterial({ color: "#C4A15A", side: THREE.BackSide, toneMapped: false, transparent: true, opacity: 0.9 }),
      );
      hull.scale.setScalar(1.006);
      hull.userData.keepSolid = true;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry, 26),
        new THREE.LineBasicMaterial({ color: "#D6B26A", toneMapped: false }),
      );
      edges.userData.keepSolid = true;
      group.add(hull, edges);
    }
    const state = useLab.getState();
    group.visible = (state.aimed && state.selected === part) || swapFlashOn(part);
  });
  return <group ref={ref} visible={false} userData={{ keepSolid: true }} />;
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
      <Callouts />
      <HoloShell />
      <pointLight position={[0, 6, 18]} intensity={0.35} color="#e7c48a" distance={90} />
      <Shadow fitWidth={fit.bottleW} />
      <Turntable />
    </Clock.Provider>
  );
}

function Turntable() {
  const solo = useLab((s) => s.solo);
  const disc = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (disc.current) disc.current.rotation.y += dt * 0.35;
  });
  if (!solo) return null;
  return (
    <group ref={disc} position={[0, 0.6, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[52, 72]} />
        <meshStandardMaterial color="#12161c" metalness={0.72} roughness={0.28} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <ringGeometry args={[34, 48, 80]} />
        <meshBasicMaterial color="#e7d3ae" transparent opacity={0.45} />
      </mesh>
    </group>
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
  const onStage = useLab((s) => s.stage) !== "box";
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
    <PartShell part="bottle" index={5} home={[0, 0, 0]} explode={[0, 0, 0]} visible={design.bottle.visible && onStage} variantKey={spec.id}>
      <mesh geometry={geo} renderOrder={2}>
        <FinishMaterial finish={design.bottle.finish} color={design.bottle.color} flat={spec.faceted} glass />
        <GoldRim part="bottle" stamp={spec.id + design.bottle.finish} />
      </mesh>
    </PartShell>
  );
}

function LiquidPart() {
  const design = useLab((s) => s.design);
  const onStage = useLab((s) => s.stage) !== "box";
  const spec = bottleById(design.bottle.variantId);
  const fit = computeFit(design, false);
  const surface = Math.min(
    design.bottle.heightMm - 6,
    Math.max(8, 4 + design.liquid.fill * design.bottle.heightMm * 0.7),
  );
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
        inset: 1.5,
        closedTop: true,
        limitY: surface,
      }),
    [design.bottle.heightMm, design.bottle.widthMm, design.bottle.depthMm, design.bottle.neck, spec, surface],
  );
  return (
    <PartShell part="liquid" index={5} home={[0, 0, 0]} explode={[0, 0, 0]} visible={design.liquid.visible && design.bottle.visible && onStage} variantKey={spec.id + design.liquid.color + surface.toFixed(1)}>
      <mesh geometry={geo} renderOrder={1}>
        <meshStandardMaterial
          color={design.liquid.color}
          emissive={design.liquid.color}
          emissiveIntensity={0.42}
          roughness={0.22}
          metalness={0.02}
          transparent
          depthWrite
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <pointLight position={[0, Math.max(8, surface * 0.55), 0]} color={design.liquid.color} intensity={3.2} distance={70} decay={2} />
    </PartShell>
  );
}

function CapPart() {
  const design = useLab((s) => s.design);
  const onStage = useLab((s) => s.stage) !== "box";
  const spec = capById(design.cap.variantId);
  const fit = computeFit(design, false);
  const radii = latheProfile(spec.id)?.radii;
  const geo = useDisposable(
    () => radii && radii.length > 3
      ? latheGeometry(radii, fit.capH, fit.capW / 2)
      : buildCapGeometry(spec.profile, spec.section, fit.capH, fit.capW, fit.capD, spec.softness, spec.faceted, fit.collarOuter + 0.3),
    [spec, fit.capH, fit.capW, fit.capD, fit.collarOuter, radii],
  );
  const glass = isGlass(design.cap.finish);
  return (
    <PartShell part="cap" index={1} home={[0, fit.capBottom, 0]} explode={fit.explode.cap} visible={design.cap.visible && onStage} variantKey={spec.id}>
      <mesh geometry={geo}>
        <FinishMaterial finish={design.cap.finish} color={design.cap.color} flat={spec.faceted} glass={glass} />
        <GoldRim part="cap" stamp={`${spec.id}:${fit.capW.toFixed(1)}:${fit.capH.toFixed(1)}`} />
      </mesh>
    </PartShell>
  );
}

function CollarPart() {
  const design = useLab((s) => s.design);
  const onStage = useLab((s) => s.stage) !== "box";
  const spec = collarById(design.collar.variantId);
  const fit = computeFit(design, false);
  const radii = latheProfile(spec.id)?.radii;
  const lathe = useDisposable(
    () => (radii && radii.length > 3 ? latheGeometry(radii, fit.collarHeight, fit.collarOuter) : new THREE.BufferGeometry()),
    [radii, fit.collarHeight, fit.collarOuter],
  );
  const y = fit.collarHeight / 2;
  if (radii && radii.length > 3) {
    return (
      <PartShell part="collar" index={3} home={[0, fit.collarBottom, 0]} explode={fit.explode.collar} visible={design.collar.visible && onStage} variantKey={spec.id + design.bottle.neck}>
        <mesh geometry={lathe}>
          <FinishMaterial finish={design.collar.finish} color={design.collar.color} />
          <GoldRim part="collar" stamp={`${spec.id}:lathe`} />
        </mesh>
      </PartShell>
    );
  }
  return (
    <PartShell part="collar" index={3} home={[0, fit.collarBottom, 0]} explode={fit.explode.collar} visible={design.collar.visible && onStage} variantKey={spec.id + design.bottle.neck}>
      <mesh position={[0, y, 0]}>
        <cylinderGeometry args={[fit.collarOuter, fit.collarOuter - spec.flareMm * 0.15, fit.collarHeight, spec.knurl ? 18 : 48, 1]} />
        <FinishMaterial finish={design.collar.finish} color={design.collar.color} flat={spec.knurl} />
        <GoldRim part="collar" stamp={spec.id + design.bottle.neck} />
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
  const onStage = useLab((s) => s.stage) !== "box";
  const spec = pumpById(design.pump.variantId);
  const exploded = useLab((s) => s.explode) > 0.45;
  const fit = computeFit(design, exploded || !design.cap.visible);
  const radii = latheProfile(spec.id)?.radii;
  const lathe = useDisposable(
    () => (radii && radii.length > 3 ? latheGeometry(radii, fit.actuatorH, fit.actuatorR * 1.4) : new THREE.BufferGeometry()),
    [radii, fit.actuatorH, fit.actuatorR],
  );
  const tube = useDisposable(() => {
    const length = Math.max(18, fit.pumpBase - 8);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.7, -length * 0.45, 0.5),
      new THREE.Vector3(-0.35, -length, -0.25),
    ]);
    return new THREE.TubeGeometry(curve, 28, 0.72, 8, false);
  }, [fit.pumpBase]);
  if (radii && radii.length > 3) {
    return (
      <PartShell part="pump" index={2} home={[0, fit.pumpBase, 0]} explode={fit.explode.pump} visible={design.pump.visible && onStage} variantKey={spec.id}>
        <mesh geometry={lathe}>
          <FinishMaterial finish={design.pump.finish} color={design.pump.color} />
          <GoldRim part="pump" stamp={`${spec.id}:lathe`} />
        </mesh>
      </PartShell>
    );
  }
  return (
    <PartShell part="pump" index={2} home={[0, fit.pumpBase, 0]} explode={fit.explode.pump} visible={design.pump.visible && onStage} variantKey={spec.id}>
      <mesh geometry={tube} position={[0, -1, 0]}>
        <FinishMaterial finish={design.pump.finish} color={design.pump.color} />
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
          <GoldRim part="pump" stamp={`${style}-${h.toFixed(1)}`} />
        </mesh>
      ) : (
        <mesh position={[0, h / 2, 0]}>
          <cylinderGeometry args={[style === "flat" ? r * 1.15 : r, style === "shroud" ? r * 1.05 : r * 0.92, h, style === "screw" ? 20 : 36]} />
          <FinishMaterial finish={finish} color={color} />
          <GoldRim part="pump" stamp={`${style}-${h.toFixed(1)}`} />
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
  const onStage = useLab((s) => s.stage) !== "box";
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
  const plate = useDisposable(() => buildLabelPatch({
    height: design.bottle.heightMm,
    width: design.bottle.widthMm,
    depth: design.bottle.depthMm,
    section: bottle.section,
    softness: bottle.softness,
    faceted: bottle.faceted,
    neckR: fit.neckR,
    profile: bottle.profile,
    shoulder: bottle.shoulder,
    yCenter: fit.labelY,
    patchH: fit.labelH,
    patchW: fit.labelW,
  }), [fit.labelW, fit.labelH, fit.labelY, fit.neckR, design.bottle.heightMm, design.bottle.widthMm, design.bottle.depthMm, bottle]);
  return (
    <PartShell part="label" index={4} home={[0, fit.labelY, fit.labelZ]} explode={fit.explode.label} visible={design.label.visible && onStage} variantKey={spec.id + design.label.text + bottle.id}>
      <mesh geometry={plate} renderOrder={3}>
        <meshPhysicalMaterial
          color={design.label.color}
          metalness={spec.application === "foil" ? 0.62 : spec.application === "emboss" ? 0.34 : 0.12}
          roughness={spec.application === "foil" ? 0.32 : 0.48}
          envMapIntensity={0.55}
          clearcoat={spec.application === "foil" ? 0.4 : 0.08}
          clearcoatRoughness={0.35}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
        <GoldRim part="label" stamp={spec.id + design.label.text} />
      </mesh>
      <mesh geometry={plate} renderOrder={4}>
        <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
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
  const stage = useLab((s) => s.stage);
  const spec = boxById(design.box.variantId);
  const fit = computeFit(design, false);
  const home: [number, number, number] = stage === "box" ? [0, 0, 0] : [fit.boxX, 0, fit.boxZ];
  const burst: [number, number, number] = stage === "box" ? [0, 0, 0] : fit.explode.box;
  const shown = stage === "box" || (stage === "together" && design.box.visible);
  return (
    <PartShell part="box" index={0} home={home} explode={burst} visible={shown} variantKey={spec.id}>
      <BoxFormMesh form={spec.form} w={fit.boxW} h={fit.boxH} d={fit.boxD} finish={design.box.finish} color={design.box.color} />
    </PartShell>
  );
}

function BrandPlate({ w, y, z }: { w: number; y: number; z: number }) {
  const blueprint = useLab((s) => s.blueprint);
  const text = useLab((s) => s.design.label.text);
  const variantId = useLab((s) => s.design.label.variantId);
  const tex = useMemo(() => {
    const canvas = logoTexture(logoById(variantId), text, "#f6f1e6", 512);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [text, variantId]);
  useEffect(() => () => tex.dispose(), [tex]);
  if (blueprint) return null;
  return (
    <mesh position={[0, y, z]}>
      <planeGeometry args={[Math.min(w * 0.48, 52), 18]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
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
  const stage = useLab((s) => s.stage);
  const blueprint = useLab((s) => s.blueprint);
  const clock = useContext(Clock);
  const lid = useRef<THREE.Group>(null);
  const insert = useRef<THREE.Group>(null);
  const drawer = useRef<THREE.Group>(null);
  const hasLid = form === "rigid" || form === "magnetic" || form === "coffret";
  const lidH = form === "coffret" ? h * 0.34 : h * 0.28;
  useFrame(() => {
    const amount = stage === "box" ? clock.current : 0;
    if (lid.current) {
      const rest = stage === "together" && (form === "magnetic" || form === "coffret") ? 0.22 : 0;
      lid.current.rotation.x = hasLid ? rest + (stage === "box" ? amount * 1.05 : 0) : 0;
    }
    if (insert.current) insert.current.position.y = 3 + amount * Math.min(26, h * 0.2);
    if (drawer.current) drawer.current.position.x = (stage === "box" ? amount : 0.16) * w * 0.48;
  });
  if (form === "tube") {
    return (
      <group>
        <mesh position={[0, h / 2, 0]}>
          <cylinderGeometry args={[Math.min(w, d) / 2, Math.min(w, d) / 2, h, 48, 1, true]} />
          <FinishMaterial finish={finish} color={color} />
          <GoldRim part="box" stamp="box" />
        </mesh>
        <BrandPlate w={w} y={h * 0.62} z={Math.min(w, d) / 2 + 0.4} />
      </group>
    );
  }
  if (form === "plinth") {
    return (
      <group>
        <RoundedBox args={[w, Math.max(16, h * 0.18), d]} radius={1.2} smoothness={3} position={[0, 8, 0]}>
          <FinishMaterial finish={finish} color={color} />
          <GoldRim part="box" stamp="box" />
        </RoundedBox>
        <BrandPlate w={w} y={Math.max(18, h * 0.18) + 1} z={d / 2 + 0.4} />
      </group>
    );
  }
  if (form === "sleeve") {
    return (
      <group position={[0, h / 2, 0]}>
        <mesh position={[0, 0, -d / 2 + wall / 2]}><boxGeometry args={[w, h, wall]} /><FinishMaterial finish={finish} color={color} /><GoldRim part="box" stamp="box" /></mesh>
        <mesh position={[-w / 2 + wall / 2, 0, 0]}><boxGeometry args={[wall, h, d]} /><FinishMaterial finish={finish} color={color} /></mesh>
        <mesh position={[w / 2 - wall / 2, 0, 0]}><boxGeometry args={[wall, h, d]} /><FinishMaterial finish={finish} color={color} /></mesh>
        <BrandPlate w={w} y={h * 0.12} z={0.4} />
      </group>
    );
  }
  const baseH = form === "drawer" ? h * 0.78 : h * (form === "window" ? 1 : 0.72);
  return (
    <group>
      <RoundedBox args={[w, baseH, d]} radius={1.4} smoothness={3} position={[0, baseH / 2, 0]}>
        <FinishMaterial finish={finish} color={color} />
        <GoldRim part="box" stamp="box" />
      </RoundedBox>
      {form === "rigid" && !blueprint && (
        <mesh position={[0, baseH * 0.62, 0]}>
          <boxGeometry args={[w + 1.4, 4.4, d + 1.4]} />
          <meshStandardMaterial color="#ffe3a4" metalness={1} roughness={0.16} emissive="#c4923a" emissiveIntensity={0.7} />
        </mesh>
      )}
      {form === "window" && !blueprint && (
        <mesh position={[0, baseH * 0.55, d / 2 + 0.2]}>
          <planeGeometry args={[w * 0.62, baseH * 0.48]} />
          <meshPhysicalMaterial color="#d4b48a" metalness={0.8} roughness={0.3} transparent opacity={0.35} />
        </mesh>
      )}
      {form !== "drawer" && (
        <group ref={insert}>
          <RoundedBox args={[w * 0.82, Math.max(8, baseH * 0.16), d * 0.82]} radius={0.6} smoothness={2} position={[0, 0, 0]}>
            <FinishMaterial finish={finish} color={color} />
          </RoundedBox>
        </group>
      )}
      {form === "drawer" && (
        <group ref={drawer}>
          <RoundedBox args={[w * 0.9, baseH * 0.42, d * 0.92]} radius={0.8} smoothness={2} position={[0, baseH * 0.28, 0]}>
            <FinishMaterial finish={finish} color={color} />
          </RoundedBox>
        </group>
      )}
      {hasLid && (
        <group ref={lid} position={[0, baseH, -d / 2]}>
          <RoundedBox args={[w, lidH, d]} radius={1.2} smoothness={3} position={[0, lidH / 2, d / 2]}>
            <FinishMaterial finish={finish} color={color} />
          </RoundedBox>
        </group>
      )}
      <BrandPlate w={w} y={baseH * 0.58} z={d / 2 + 0.6} />
    </group>
  );
}
