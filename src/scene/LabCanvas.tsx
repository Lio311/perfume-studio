import { useLayoutEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, TrackballControls } from "@react-three/drei";
import * as THREE from "three";
import { damp3 } from "maath/easing";
import { themes } from "../theme/themes.ts";
import { useLab } from "../store/labStore.ts";
import { computeFit } from "../model/fit.ts";
import { takeShot } from "./capture.ts";
import type { ViewPreset } from "../store/labStore.ts";
import { Assembly } from "./Assembly.tsx";
import { assemblyBounds, fitPose, readStageSafe } from "./framing.ts";
import { CinematicFloor, EnergyRings, MinimalRing, ParticleField, VoiceGrade } from "./voiceScenery.tsx";

const VIEW_DIR: Record<ViewPreset | "three", THREE.Vector3> = {
  home: new THREE.Vector3(0.36, 0.48, 1).normalize(),
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
    design.box.visible ? 1 : 0,
    design.box.variantId,
    design.liquid.visible ? 1 : 0,
  ].join("|");
}

function stageWash(themeId: "dark" | "light", voice: 1 | 2 | 3): { top: string; bottom: string } {
  if (themeId === "light") return { top: themes.light.scene.top, bottom: themes.light.scene.bottom };
  if (voice === 1) return { top: "#0c0c0e", bottom: "#000000" };
  if (voice === 2) return { top: "#121a22", bottom: "#03050a" };
  return { top: "#141820", bottom: "#05060a" };
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

function Studio() {
  const themeId = useLab((s) => s.theme);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const theme = themes[themeId];
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = theme.scene.exposure;
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(14, 24, 24), new THREE.MeshBasicMaterial({ color: themeId === "dark" ? "#12141a" : "#f4f0e8", side: THREE.BackSide })));
    const panel = (color: string, position: [number, number, number], size: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color }));
      mesh.position.set(...position);
      mesh.lookAt(0, 1, 0);
      env.add(mesh);
    };
    if (themeId === "dark") {
      panel("#f4efe6", [0, 8, 6], 7);
      panel("#e4c48a", [6, 2.2, -2], 3.2);
      panel("#8ea0bb", [-6, 3, 1], 2.6);
      panel("#141820", [0, -4, 6], 8);
    } else {
      panel("#ffffff", [0, 7, 8], 12);
      panel("#f4e4d0", [7, 2, 4], 5);
      panel("#d5dee8", [-7, 3, 2], 4);
    }
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(env, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = themeId === "dark" ? 0.92 : 1;
    return () => {
      target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, themeId]);
  return null;
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
  const seenView = useRef(0);
  const seenSig = useRef("");
  const greeted = useRef(false);

  const poseFor = (dir: THREE.Vector3) => {
    const state = useLab.getState();
    const bounds = assemblyBounds(state.design, state.explode);
    const safe = readStageSafe(gl.domElement);
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 30;
    return fitPose(bounds, dir, fov, safe);
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
    }
    mode.current = "anim";
  };

  useLayoutEffect(() => {
    camera.position.set(120, 150, 640);
    camera.lookAt(0, 48, 0);
  }, [camera]);

  useFrame((_, delta) => {
    const state = useLab.getState();
    const signature = frameSignature(size.width, size.height);
    if (state.focusToken !== seenFocus.current && state.selected) {
      seenFocus.current = state.focusToken;
      const fit = computeFit(state.design, state.explode > 0.45);
      const anchor = fit.anchors[state.selected];
      const dist = state.selected === "box" ? 280 : state.selected === "bottle" || state.selected === "liquid" ? 220 : 150;
      goalTarget.current.set(anchor[0], anchor[1], anchor[2]);
      goalPos.current.set(anchor[0] + dist * 0.42, anchor[1] + dist * 0.22, anchor[2] + dist);
      mode.current = "anim";
      seenSig.current = signature;
    } else if (state.viewToken !== seenView.current) {
      seenView.current = state.viewToken;
      seenSig.current = signature;
      camera.up.set(0, 1, 0);
      aim(VIEW_DIR[state.viewPreset]);
    } else if (state.voice === 3 && state.theme === "dark" && !greeted.current && !dragging.current) {
      greeted.current = true;
      seenSig.current = signature;
      camera.up.set(0, 1, 0);
      aim(VIEW_DIR.three, 1.42);
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
      damp3(camera.position, goalPos.current, 0.38, delta);
      damp3(look.current, goalTarget.current, 0.38, delta);
      camera.lookAt(look.current);
      if (camera.position.distanceTo(goalPos.current) < 1.4 && look.current.distanceTo(goalTarget.current) < 1.4) {
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
      dynamicDampingFactor={0.14}
      rotateSpeed={1.55}
      zoomSpeed={0.9}
      panSpeed={0.35}
      minDistance={70}
      maxDistance={2400}
      cursorZoom={false}
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

function Lights() {
  const themeId = useLab((s) => s.theme);
  const voice = useLab((s) => s.voice);
  const scene = themes[themeId].scene;
  if (themeId === "dark" && voice === 1) {
    return (
      <>
        <ambientLight color="#f4f1ea" intensity={0.72} />
        <directionalLight position={[30, 90, 80]} color="#fffaf4" intensity={1.15} />
        <directionalLight position={[-40, 24, 30]} color="#d9d4cc" intensity={0.35} />
      </>
    );
  }
  if (themeId === "dark" && voice === 2) {
    return (
      <>
        <ambientLight color="#d5e6ea" intensity={0.42} />
        <directionalLight position={[48, 100, 60]} color="#f7f1e6" intensity={1.25} />
        <directionalLight position={[-50, 18, -40]} color="#9fd4e0" intensity={0.85} />
        <pointLight position={[0, 18, 24]} color="#d6b26a" intensity={0.55} distance={140} />
      </>
    );
  }
  if (themeId === "dark" && voice === 3) {
    return (
      <>
        <ambientLight color="#c5ccd6" intensity={0.42} />
        <directionalLight position={[64, 72, 48]} color="#fff6ea" intensity={1.7} />
        <directionalLight position={[-24, 46, -110]} color="#f0d7a8" intensity={2.15} />
        <directionalLight position={[-70, 20, 40]} color="#8ea0b8" intensity={0.55} />
      </>
    );
  }
  return (
    <>
      <ambientLight color={scene.ambient} intensity={scene.ambientIntensity} />
      <directionalLight position={[48, 110, 72]} color={scene.key} intensity={scene.keyIntensity} />
      <directionalLight position={[-62, 28, 48]} color={scene.fill} intensity={scene.fillIntensity} />
      <directionalLight position={[-18, 36, -90]} color={scene.rim} intensity={scene.rimIntensity} />
    </>
  );
}

function Stage() {
  const theme = useLab((s) => themes[s.theme]);
  const voice = useLab((s) => s.voice);
  const dark = theme.id === "dark";
  const grid = !dark
    ? { cell: theme.scene.gridCell, section: theme.scene.gridSection }
    : voice === 1
      ? { cell: "#141414", section: "#2a2a2a" }
      : voice === 2
        ? { cell: "#163844", section: "#3d7480" }
        : { cell: "#14110e", section: "#2a241c" };
  return (
    <>
      <color attach="background" args={[dark && voice === 1 ? "#000000" : theme.scene.bottom]} />
      <Backdrop />
      <Studio />
      <Lights />
      {(voice !== 3 || !dark) && (
        <Grid
          args={[400, 400]}
          position={[0, 0, 0]}
          cellSize={voice === 1 ? 20 : 10}
          cellThickness={voice === 1 ? 0.35 : 0.55}
          cellColor={grid.cell}
          sectionSize={voice === 1 ? 80 : 50}
          sectionThickness={voice === 1 ? 0.5 : 0.9}
          sectionColor={grid.section}
          fadeDistance={voice === 1 ? 240 : 380}
          fadeStrength={1.35}
          infiniteGrid
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
