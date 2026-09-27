import { useLayoutEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, TrackballControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import { damp3 } from "maath/easing";
import { themes } from "../theme/themes.ts";
import { useLab } from "../store/labStore.ts";
import { computeFit } from "../model/fit.ts";
import { takeShot } from "./capture.ts";
import { Assembly } from "./Assembly.tsx";

const HOME_POS = new THREE.Vector3(54, 70, 188);
const HOME_TARGET = new THREE.Vector3(0, 36, 0);
const UP = new THREE.Vector3(0, 1, 0);
const OFFSET = new THREE.Vector3();

function Backdrop() {
  const theme = useLab((s) => themes[s.theme]);
  const material = useRef<THREE.ShaderMaterial>(null);
  useLayoutEffect(() => {
    if (!material.current) return;
    material.current.uniforms.top.value.set(theme.scene.top);
    material.current.uniforms.bottom.value.set(theme.scene.bottom);
  }, [theme]);
  return (
    <mesh scale={900} frustumCulled={false} renderOrder={-2}>
      <sphereGeometry args={[1, 32, 24]} />
      <shaderMaterial
        ref={material}
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={{
          top: { value: new THREE.Color(theme.scene.top) },
          bottom: { value: new THREE.Color(theme.scene.bottom) },
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
      goalPos.current.copy(HOME_POS);
      goalTarget.current.copy(HOME_TARGET);
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
  const scene = useLab((s) => themes[s.theme].scene);
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
  return (
    <>
      <color attach="background" args={[theme.scene.bottom]} />
      <Backdrop />
      <Studio />
      <Lights />
      <Grid
        args={[400, 400]}
        position={[0, 0, 0]}
        cellSize={10}
        cellThickness={0.7}
        cellColor={theme.scene.gridCell}
        sectionSize={50}
        sectionThickness={1.25}
        sectionColor={theme.scene.gridSection}
        fadeDistance={420}
        fadeStrength={1.15}
        infiniteGrid
      />
      <Assembly />
      <CameraRig />
      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom intensity={theme.id === "dark" ? 0.1 : 0.05} luminanceThreshold={0.94} luminanceSmoothing={0.18} mipmapBlur radius={0.28} />
      </EffectComposer>
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
