import { useLayoutEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, TrackballControls } from "@react-three/drei";
import * as THREE from "three";
import { themes } from "../theme/themes.ts";
import { useLab } from "../store/labStore.ts";
import { takeShot } from "./capture.ts";
import type { PartKey } from "../model/types.ts";
import type { ViewPreset } from "../store/labStore.ts";
import { Assembly } from "./Assembly.tsx";
import { assemblyBounds, fitPose, partBounds, readStageFrame } from "./framing.ts";
import { Exposure, PixelRatio, StageFloor, StudioEnv, StudioLights } from "./studio.tsx";
import { CinematicFloor, EnergyRings, MinimalRing, ParticleField, VoiceGrade } from "./voiceScenery.tsx";

const VIEW_DIR: Record<ViewPreset | "three", THREE.Vector3> = {
  home: new THREE.Vector3(0.78, 0.22, 1).normalize(),
  front: new THREE.Vector3(0.02, 0.3, 1).normalize(),
  three: new THREE.Vector3(0.9, 0.42, 1.08).normalize(),
  top: new THREE.Vector3(0.05, 1, 0.2).normalize(),
  side: new THREE.Vector3(1, 0.24, 0.05).normalize(),
};
const UP = new THREE.Vector3(0, 1, 0);
const OFFSET = new THREE.Vector3();
const ORBIT_TARGET = new THREE.Vector3(0, 48, 0);

function frameSignature(width: number, height: number): string {
  const state = useLab.getState();
  const design = state.design;
  const slot = document.querySelector(".stage-slot")?.getBoundingClientRect();
  return [
    state.explode.toFixed(3),
    state.viewPreset,
    state.voice,
    state.theme,
    width,
    height,
    Math.round(slot?.width ?? 0),
    Math.round(slot?.height ?? 0),
    design.bottle.widthMm,
    design.bottle.heightMm,
    design.bottle.depthMm,
    design.bottle.visible ? 1 : 0,
    design.cap.widthMm,
    design.cap.heightMm,
    design.cap.visible ? 1 : 0,
    design.pump.visible ? 1 : 0,
    design.collar.visible ? 1 : 0,
    design.label.visible ? 1 : 0,
    state.stage,
    design.box.visible ? 1 : 0,
    design.box.widthMm,
    design.box.heightMm,
    design.box.depthMm,
    design.box.variantId,
    design.liquid.visible ? 1 : 0,
  ].join("|");
}

function stageWash(themeId: "dark" | "light", voice: 1 | 2 | 3): { top: string; bottom: string } {
  if (themeId === "light") return { top: themes.light.scene.top, bottom: themes.light.scene.bottom };
  if (voice === 1) return { top: "#1a2230", bottom: "#0a0d14" };
  if (voice === 2) return { top: "#152028", bottom: "#070b12" };
  return { top: "#1c2230", bottom: "#090c12" };
}

function Backdrop() {
  const themeId = useLab((s) => s.theme);
  const voice = useLab((s) => s.voice);
  const wash = stageWash(themeId, voice);
  const material = useRef<THREE.ShaderMaterial>(null);
  useLayoutEffect(() => {
    if (!material.current) return;
    material.current.uniforms.top.value.set(wash.top);
    material.current.uniforms.bottom.value.set(wash.bottom);
  }, [wash.top, wash.bottom]);
  return (
    <mesh scale={900} frustumCulled={false} renderOrder={-2}>
      <sphereGeometry args={[1, 32, 24]} />
      <shaderMaterial
        ref={material}
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={{
          top: { value: new THREE.Color(wash.top) },
          bottom: { value: new THREE.Color(wash.bottom) },
        }}
        vertexShader="varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader="varying vec3 vPos; uniform vec3 top; uniform vec3 bottom; void main(){ float h = smoothstep(-0.35, 0.55, vPos.y); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }"
      />
    </mesh>
  );
}

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as { enabled: boolean; target: THREE.Vector3; update: () => void } | null;
  const dragging = useRef(false);
  const pendingFit = useRef(false);
  const mode = useRef<"idle" | "anim">("idle");
  const goalPos = useRef(new THREE.Vector3(120, 150, 640));
  const goalTarget = useRef(new THREE.Vector3(0, 48, 0));
  const look = useRef(new THREE.Vector3(0, 48, 0));
  const direction = useRef(VIEW_DIR.home.clone());
  const seenFocus = useRef(0);
  const seenFull = useRef(0);
  const seenView = useRef(0);
  const seenSig = useRef("");
  const greeted = useRef(false);
  const focused = useRef(false);
  const fromPos = useRef(new THREE.Vector3());
  const fromLook = useRef(new THREE.Vector3());
  const animStart = useRef(0);

  const begin = () => {
    fromPos.current.copy(camera.position);
    fromLook.current.copy(look.current);
    animStart.current = performance.now();
    mode.current = "anim";
  };

  const poseFor = (dir: THREE.Vector3, bounds = assemblyBounds(useLab.getState().design, useLab.getState().explode, useLab.getState().stage)) => {
    const frame = readStageFrame(gl.domElement);
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 30;
    return fitPose(bounds, dir, fov, frame);
  };

  const aimPart = (part: PartKey) => {
    const state = useLab.getState();
    const bounds = partBounds(state.design, state.explode, part, state.stage);
    const dir = camera.position.clone().sub(look.current);
    if (dir.length() < 10) dir.copy(direction.current);
    if (dir.y < 0.08) dir.y = 0.16;
    dir.normalize();
    direction.current.copy(dir);
    const pose = poseFor(dir, bounds);
    goalPos.current.copy(pose.position);
    goalTarget.current.copy(pose.target);
    begin();
  };

  const aim = (dir: THREE.Vector3, pullBack = 1) => {
    direction.current.copy(dir);
    const pose = poseFor(dir);
    goalPos.current.copy(pose.position);
    goalTarget.current.copy(pose.target);
    if (pullBack > 1) {
      const away = pose.position.clone().sub(pose.target);
      const length = away.length();
      camera.position.copy(pose.target).addScaledVector(away.normalize(), length * pullBack);
      camera.up.set(0, 1, 0);
      camera.lookAt(pose.target);
      look.current.copy(pose.target);
      fromPos.current.copy(camera.position);
      fromLook.current.copy(look.current);
    }
    begin();
  };

  useLayoutEffect(() => {
    camera.position.set(120, 150, 640);
    camera.lookAt(0, 48, 0);
  }, [camera]);

  useFrame((_, delta) => {
    const state = useLab.getState();
    const signature = frameSignature(size.width, size.height);
    if (state.fullToken !== seenFull.current) {
      seenFull.current = state.fullToken;
      seenFocus.current = state.focusToken;
      focused.current = false;
      seenSig.current = signature;
      camera.up.set(0, 1, 0);
      aim(direction.current);
    } else if (state.viewToken !== seenView.current) {
      seenView.current = state.viewToken;
      seenFocus.current = state.focusToken;
      focused.current = false;
      seenSig.current = signature;
      camera.up.set(0, 1, 0);
      aim(VIEW_DIR[state.viewPreset]);
    } else if (state.focusToken !== seenFocus.current && state.selected) {
      seenFocus.current = state.focusToken;
      focused.current = true;
      seenSig.current = signature;
      aimPart(state.selected);
    } else if (state.voice === 3 && state.theme === "dark" && !greeted.current && !dragging.current) {
      greeted.current = true;
      seenSig.current = signature;
      camera.up.set(0, 1, 0);
      aim(VIEW_DIR.three, 1.42);
    } else if (signature !== seenSig.current && focused.current && state.selected && !dragging.current) {
      seenSig.current = signature;
      aimPart(state.selected);
    } else if (signature !== seenSig.current && !dragging.current) {
      if (mode.current === "anim" && greeted.current && state.voice === 3) pendingFit.current = true;
      else {
        seenSig.current = signature;
        aim(direction.current);
      }
    } else if (signature !== seenSig.current && dragging.current) {
      pendingFit.current = true;
    }
    if (state.voice !== 3) greeted.current = false;

    if (mode.current === "anim") {
      if (controls) controls.enabled = false;
      const t = Math.min(1, (performance.now() - animStart.current) / 720);
      const eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(fromPos.current, goalPos.current, eased);
      look.current.lerpVectors(fromLook.current, goalTarget.current, eased);
      camera.lookAt(look.current);
      if (t >= 1) {
        mode.current = "idle";
        camera.position.copy(goalPos.current);
        look.current.copy(goalTarget.current);
        camera.lookAt(look.current);
        ORBIT_TARGET.copy(look.current);
        if (controls) {
          controls.target.copy(look.current);
          controls.enabled = true;
          (controls as { _lastAngle?: number })._lastAngle = 0;
          controls.update();
        }
        if (pendingFit.current) {
          pendingFit.current = false;
          seenSig.current = "";
        }
      }
      const shot = takeShot();
      if (shot) shot(gl.domElement.toDataURL("image/png"));
      return;
    }
    if (state.autoRotate && controls && !dragging.current) {
      OFFSET.copy(camera.position).sub(controls.target);
      OFFSET.applyAxisAngle(UP, delta * 0.28);
      camera.position.copy(controls.target).add(OFFSET);
      camera.up.lerp(UP, 0.02).normalize();
      camera.lookAt(controls.target);
    }
    const shot = takeShot();
    if (shot) shot(gl.domElement.toDataURL("image/png"));
  }, 1);

  return (
    <TrackballControls
      makeDefault
      target={ORBIT_TARGET}
      staticMoving={false}
      dynamicDampingFactor={0.08}
      rotateSpeed={1.55}
      zoomSpeed={0.55}
      panSpeed={0.35}
      minDistance={40}
      maxDistance={2400}
      cursorZoom
      onStart={() => {
        dragging.current = true;
        mode.current = "idle";
      }}
      onEnd={() => {
        dragging.current = false;
        if (pendingFit.current) {
          pendingFit.current = false;
          seenSig.current = "";
        }
      }}
    />
  );
}

function Stage() {
  const theme = useLab((s) => themes[s.theme]);
  const voice = useLab((s) => s.voice);
  const blueprint = useLab((s) => s.blueprint);
  const stage = useLab((s) => s.stage);
  const dark = theme.id === "dark";
  const grid = !dark
    ? { cell: theme.scene.gridCell, section: theme.scene.gridSection }
    : blueprint
      ? { cell: "#3a3428", section: "#c4a15a" }
      : voice === 1
        ? { cell: "#1a3344", section: "#3d6e84" }
        : voice === 2
          ? { cell: "#163844", section: "#3d7480" }
          : { cell: "#14110e", section: "#2a241c" };
  return (
    <>
      <color attach="background" args={[theme.scene.bottom]} />
      <Exposure />
      <PixelRatio />
      <Backdrop />
      <StudioEnv />
      <StudioLights />
      <StageFloor />
      {(voice !== 3 || !dark || blueprint) && (
        <Grid
          args={[400, 400]}
          position={[0, 0, 0]}
          cellSize={voice === 1 ? 12 : 10}
          cellThickness={blueprint ? 0.7 : 0.55}
          cellColor={grid.cell}
          sectionSize={voice === 1 ? 80 : 50}
          sectionThickness={blueprint ? 0.85 : voice === 1 ? 0.5 : 0.9}
          sectionColor={grid.section}
          fadeDistance={voice === 1 ? 360 : 420}
          fadeStrength={1.2}
          infiniteGrid
        />
      )}
      {stage !== "together" && (
        <Grid
          args={[340, 220]}
          position={[0, 100, stage === "box" ? -150 : -190]}
          rotation={[Math.PI / 2, 0, 0]}
          cellSize={16}
          cellThickness={0.4}
          cellColor={blueprint ? "#4a4030" : "#1c2a34"}
          sectionSize={80}
          sectionThickness={0.55}
          sectionColor={blueprint ? "#8a7044" : "#2a3c48"}
          fadeDistance={240}
          fadeStrength={1.7}
        />
      )}
      {dark && voice === 1 && <MinimalRing />}
      {dark && voice === 2 && (
        <>
          <ParticleField />
          <EnergyRings />
        </>
      )}
      {dark && voice === 3 && <CinematicFloor />}
      {!dark &&
        [48, 78].map((radius) => (
          <mesh key={radius} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
            <ringGeometry args={[radius - 0.4, radius, 96]} />
            <meshBasicMaterial color="#c4b49a" transparent opacity={0.28} depthWrite={false} />
          </mesh>
        ))}
      <Assembly />
      <CameraRig />
      <VoiceGrade />
    </>
  );
}

export function LabCanvas() {
  return (
    <Canvas
      className="stage-canvas"
      dpr={[1, 1.5]}
      camera={{ position: [120, 150, 640], fov: 30, near: 0.5, far: 5000 }}
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance", localClippingEnabled: true }}
    >
      <Stage />
    </Canvas>
  );
}
