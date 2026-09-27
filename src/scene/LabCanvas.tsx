import { useLayoutEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, TrackballControls } from "@react-three/drei";
import * as THREE from "three";
import { damp3 } from "maath/easing";
import { themes } from "../theme/themes.ts";
import { useLab } from "../store/labStore.ts";
import { computeFit } from "../model/fit.ts";
import { takeShot } from "./capture.ts";
import { Assembly } from "./Assembly.tsx";
import { CinematicFloor, EnergyRings, MinimalRing, ParticleField, VoiceGrade } from "./voiceScenery.tsx";

const PRESETS = {
  home: { pos: new THREE.Vector3(54, 70, 188), target: new THREE.Vector3(0, 36, 0) },
  front: { pos: new THREE.Vector3(0, 48, 206), target: new THREE.Vector3(0, 42, 0) },
  three: { pos: new THREE.Vector3(86, 58, 156), target: new THREE.Vector3(0, 40, 0) },
  top: { pos: new THREE.Vector3(0.4, 250, 28), target: new THREE.Vector3(0, 24, 0) },
  side: { pos: new THREE.Vector3(214, 42, 0), target: new THREE.Vector3(0, 40, 0) },
} as const;
const HOME_POS = PRESETS.home.pos;
const HOME_TARGET = PRESETS.home.target;
const UP = new THREE.Vector3(0, 1, 0);
const OFFSET = new THREE.Vector3();

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
  const controls = useThree((s) => s.controls) as { enabled: boolean; target: THREE.Vector3; update: () => void } | null;
  const dragging = useRef(false);
  const mode = useRef<"idle" | "anim">("idle");
  const goalPos = useRef(HOME_POS.clone());
  const goalTarget = useRef(HOME_TARGET.clone());
  const look = useRef(HOME_TARGET.clone());
  const seenFocus = useRef(0);
  const seenView = useRef(0);
  const greeted = useRef(false);

  useLayoutEffect(() => {
    camera.position.copy(HOME_POS);
    camera.lookAt(HOME_TARGET);
  }, [camera]);

  useFrame((_, delta) => {
    const state = useLab.getState();
    if (state.focusToken !== seenFocus.current && state.selected) {
      seenFocus.current = state.focusToken;
      const fit = computeFit(state.design, false);
      const anchor = fit.anchors[state.selected];
      const dist = state.selected === "box" ? 210 : state.selected === "bottle" || state.selected === "liquid" ? 150 : 96;
      goalTarget.current.set(anchor[0], anchor[1], anchor[2]);
      goalPos.current.set(anchor[0] + dist * 0.38, anchor[1] + dist * 0.16, anchor[2] + dist * 0.9);
      mode.current = "anim";
    }
    if (state.viewToken !== seenView.current) {
      seenView.current = state.viewToken;
      const preset = PRESETS[state.viewPreset];
      goalPos.current.copy(preset.pos);
      goalTarget.current.copy(preset.target);
      camera.up.set(0, 1, 0);
      mode.current = "anim";
    }
    if (mode.current === "anim") {
      if (controls) controls.enabled = false;
      damp3(camera.position, goalPos.current, 0.42, delta);
      damp3(look.current, goalTarget.current, 0.42, delta);
      camera.lookAt(look.current);
      if (camera.position.distanceTo(goalPos.current) < 1.2) {
        mode.current = "idle";
        if (controls) {
          controls.target.copy(look.current);
          controls.enabled = true;
          (controls as { _lastAngle?: number })._lastAngle = 0;
          controls.update();
        }
      }
      return;
    }
    if (state.autoRotate && controls && !dragging.current) {
      OFFSET.copy(camera.position).sub(controls.target);
      OFFSET.applyAxisAngle(UP, delta * 0.28);
      camera.position.copy(controls.target).add(OFFSET);
      camera.up.lerp(UP, 0.02).normalize();
      camera.lookAt(controls.target);
    }
    if (state.voice !== 3) greeted.current = false;
    if (state.voice === 3 && state.theme === "dark" && !greeted.current && !dragging.current && mode.current === "idle") {
      greeted.current = true;
      camera.position.set(128, 58, 250);
      look.current.set(0, 36, 0);
      goalPos.current.copy(PRESETS.three.pos);
      goalTarget.current.copy(PRESETS.three.target);
      camera.up.set(0, 1, 0);
      mode.current = "anim";
    }
    const shot = takeShot();
    if (shot) shot(gl.domElement.toDataURL("image/png"));
  }, 1);

  return (
      <TrackballControls
      makeDefault
      target={[0, 36, 0]}
      staticMoving={false}
      dynamicDampingFactor={0.14}
      rotateSpeed={1.55}
      zoomSpeed={0.9}
      panSpeed={0.35}
      minDistance={48}
      maxDistance={560}
      cursorZoom={false}
      onStart={() => {
        dragging.current = true;
        mode.current = "idle";
      }}
      onEnd={() => {
        dragging.current = false;
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
      camera={{ position: [54, 70, 188], fov: 30, near: 0.5, far: 2400 }}
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance", localClippingEnabled: true }}
    >
      <Stage />
    </Canvas>
  );
}
