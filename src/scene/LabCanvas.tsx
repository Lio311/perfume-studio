import { useEffect, useLayoutEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, TrackballControls } from "@react-three/drei";
import * as THREE from "three";
import { themes } from "../theme/themes.ts";
import { useLab } from "../store/labStore.ts";
import { takeShot } from "./capture.ts";
import type { PartKey } from "../model/types.ts";
import type { ViewPreset } from "../store/labStore.ts";
import { Assembly } from "./Assembly.tsx";
import { clearPartPointer, consumePartPointer, releaseFocus } from "./focusClick.ts";
import { assemblyBounds, fitPose, FOCUS_FILL, orbitLimits, partBounds, readStageFrame } from "./framing.ts";
import { cameraProbe, sceneSpan } from "./limits.ts";
import { decayGlide, emptyGlide, poseBroken, pushGlide, takeStep, type Glide } from "./orbitGlide.ts";
import { Exposure, PixelRatio, StageFloor, StudioEnv, StudioLights } from "./studio.tsx";
import { CinematicFloor, EnergyRings, ParticleField, VoiceGrade } from "./voiceScenery.tsx";

const VIEW_DIR: Record<ViewPreset | "three", THREE.Vector3> = {
  home: new THREE.Vector3(0.78, 0.22, 1).normalize(),
  front: new THREE.Vector3(0.02, 0.3, 1).normalize(),
  three: new THREE.Vector3(0.9, 0.42, 1.08).normalize(),
  top: new THREE.Vector3(0.05, 1, 0.2).normalize(),
  side: new THREE.Vector3(1, 0.24, 0.05).normalize(),
};
const UP = new THREE.Vector3(0, 1, 0);
const OFFSET = new THREE.Vector3();
const GLIDE_OFFSET = new THREE.Vector3();
const GLIDE_RIGHT = new THREE.Vector3();
const YAW_Q = new THREE.Quaternion();
const PITCH_Q = new THREE.Quaternion();
const ORBIT_TARGET = new THREE.Vector3(0, 48, 0);
const HOME_FOCUS = new THREE.Vector3(0, 48, 0);

const MAX_POLAR = 1.5;

function tuneNear(camera: THREE.Camera, dist: number, radius: number) {
  if (!(camera instanceof THREE.PerspectiveCamera)) return;
  const limits = orbitLimits(radius, camera.fov);
  const near = THREE.MathUtils.clamp(limits.near, 0.2, Math.max(0.4, dist * 0.08));
  const far = Math.max(limits.far, dist * 8);
  if (Math.abs(camera.near - near) < near * 0.2 && Math.abs(camera.far - far) < 20) return;
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
}

function clampOrbit(camera: THREE.Camera, target: THREE.Vector3, radius: number) {
  if (!(camera instanceof THREE.PerspectiveCamera)) return;
  const limits = orbitLimits(radius, camera.fov);
  target.y = Math.max(6, target.y);
  OFFSET.copy(camera.position).sub(target);
  const len = THREE.MathUtils.clamp(OFFSET.length() || 1, limits.min, limits.max);
  const polar = Math.acos(THREE.MathUtils.clamp(OFFSET.y / (OFFSET.length() || 1), -1, 1));
  if (polar > MAX_POLAR) {
    const horiz = Math.hypot(OFFSET.x, OFFSET.z) || 1;
    OFFSET.x = (OFFSET.x / horiz) * Math.sin(MAX_POLAR) * len;
    OFFSET.z = (OFFSET.z / horiz) * Math.sin(MAX_POLAR) * len;
    OFFSET.y = Math.cos(MAX_POLAR) * len;
  } else {
    OFFSET.setLength(len);
  }
  camera.position.copy(target).add(OFFSET);
}

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
    state.solo ?? "-",
    design.box.visible ? 1 : 0,
    design.box.widthMm,
    design.box.heightMm,
    design.box.depthMm,
    design.box.variantId,
    design.liquid.visible ? 1 : 0,
    state.boxOpen ? 1 : 0,
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
  const radius = useRef(48);

  const measureRadius = () => {
    const state = useLab.getState();
    const lid = state.boxOpen && state.stage !== "bottle";
    const box = state.solo
      ? partBounds(state.design, state.explode, state.solo, state.stage, true, lid)
      : state.aimed && state.selected
        ? partBounds(state.design, state.explode, state.selected, state.stage, false, lid)
        : assemblyBounds(state.design, state.explode, state.stage, lid);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    radius.current = Math.max(18, sphere.radius);
    sceneSpan.radius = radius.current;
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 30;
    const limits = orbitLimits(radius.current, fov);
    const rig = controls as { minDistance?: number; maxDistance?: number } | null;
    if (rig) {
      rig.minDistance = limits.min;
      rig.maxDistance = limits.max;
    }
    return limits;
  };

  const begin = () => {
    fromPos.current.copy(camera.position);
    fromLook.current.copy(look.current);
    animStart.current = performance.now();
    mode.current = "anim";
    sceneSpan.flying = true;
  };

  const poseFor = (dir: THREE.Vector3, bounds?: THREE.Box3, fill?: number) => {
    const state = useLab.getState();
    const lid = state.boxOpen && state.stage !== "bottle";
    const box = bounds ?? (state.solo
      ? partBounds(state.design, state.explode, state.solo, state.stage, true, lid)
      : assemblyBounds(state.design, state.explode, state.stage, lid));
    const frame = readStageFrame(gl.domElement);
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 30;
    return fitPose(box, dir, fov, frame, fill);
  };

  const aimPart = (part: PartKey) => {
    const state = useLab.getState();
    const bounds = partBounds(state.design, state.explode, part, state.stage, state.solo === part, state.boxOpen && state.stage !== "bottle");
    const dir = camera.position.clone().sub(look.current);
    if (dir.length() < 10) dir.copy(direction.current);
    if (dir.y < 0.08) dir.y = 0.16;
    if (part === "box" && state.boxOpen) dir.y = Math.max(dir.y, 0.72);
    dir.normalize();
    direction.current.copy(dir);
    const pose = poseFor(dir, bounds, FOCUS_FILL);
    goalPos.current.copy(pose.position);
    goalTarget.current.copy(pose.target);
    begin();
  };

  const aim = (dir: THREE.Vector3, pullBack = 1) => {
    direction.current.copy(dir);
    const state = useLab.getState();
    const framed = dir.clone();
    if (state.stage !== "bottle" && state.boxOpen && !state.solo) {
      framed.y = Math.max(framed.y, 0.72);
      framed.normalize();
    }
    const pose = poseFor(framed);
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

  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const glide = useRef<Glide>(emptyGlide());

  const recoverHome = () => {
    camera.position.copy(VIEW_DIR.home).multiplyScalar(260).add(HOME_FOCUS);
    look.current.copy(HOME_FOCUS);
    camera.up.copy(UP);
    camera.lookAt(look.current);
    direction.current.copy(VIEW_DIR.home);
    fromPos.current.copy(camera.position);
    fromLook.current.copy(look.current);
    goalPos.current.copy(camera.position);
    goalTarget.current.copy(look.current);
    ORBIT_TARGET.copy(look.current);
    mode.current = "idle";
    sceneSpan.flying = false;
    focused.current = false;
    const fresh = emptyGlide();
    glide.current.yaw = fresh.yaw;
    glide.current.pitch = fresh.pitch;
    glide.current.zoom = fresh.zoom;
    glide.current.panX = fresh.panX;
    glide.current.panY = fresh.panY;
    const rig = controlsRef.current as { enabled: boolean; target: THREE.Vector3; _lastAngle?: number } | null;
    if (rig) {
      rig.target.copy(look.current);
      rig.enabled = true;
      rig._lastAngle = 0;
    }
  };

  const releaseTween = () => {
    if (mode.current !== "anim") return;
    mode.current = "idle";
    sceneSpan.flying = false;
    pendingFit.current = false;
    camera.up.copy(UP);
    if (!Number.isFinite(look.current.x)) look.current.copy(HOME_FOCUS);
    camera.lookAt(look.current);
    const rig = controlsRef.current as { enabled: boolean; target: THREE.Vector3; _lastAngle?: number } | null;
    if (rig) {
      rig.target.copy(look.current);
      rig.enabled = true;
      rig._lastAngle = 0;
    }
    glide.current.yaw = 0;
    glide.current.pitch = 0;
    glide.current.zoom = 0;
    glide.current.panX = 0;
    glide.current.panY = 0;
  };

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      releaseTween();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 40 : 1;
      const dx = event.deltaX * unit;
      const dy = event.deltaY * unit;
      const pinch = event.ctrlKey || event.metaKey;
      if (event.shiftKey && !pinch) {
        pushGlide(glide.current, dx, dy, "pan");
        return;
      }
      if (pinch) {
        pushGlide(glide.current, dx, dy, "pinch");
        return;
      }
      pushGlide(glide.current, dx, dy, "orbit");
    };
    const onDown = (event: PointerEvent) => {
      releaseTween();
      const lab = useLab.getState();
      if (lab.present && lab.autoRotate) useLab.setState({ autoRotate: false });
      const rig = controlsRef.current as { mouseButtons?: { LEFT: number } } | null;
      if (!rig?.mouseButtons) return;
      rig.mouseButtons.LEFT = event.button === 0 && event.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    };
    const onUp = () => {
      const rig = controlsRef.current as { mouseButtons?: { LEFT: number } } | null;
      if (rig?.mouseButtons) rig.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    };
    const stopSpin = () => {
      const lab = useLab.getState();
      if (lab.present && lab.autoRotate) useLab.setState({ autoRotate: false });
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    el.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointerdown", stopSpin, true);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel, { capture: true });
      el.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointerdown", stopSpin, true);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl]);

  useFrame((_, delta) => {
    if (poseBroken(camera.position, look.current, camera.up)) recoverHome();
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
      const t = Math.min(1, (performance.now() - animStart.current) / 1350);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
      camera.position.lerpVectors(fromPos.current, goalPos.current, eased);
      look.current.lerpVectors(fromLook.current, goalTarget.current, eased);
      camera.lookAt(look.current);
        if (t >= 1) {
        mode.current = "idle";
        sceneSpan.flying = false;
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
      measureRadius();
      tuneNear(camera, camera.position.distanceTo(look.current), radius.current);
      const shot = takeShot();
      if (shot) shot(gl.domElement.toDataURL("image/png"));
      return;
    }
    const limits = measureRadius();
    const glideNow = glide.current;
    const yaw = takeStep(glideNow.yaw, 0.008);
    const pitch = takeStep(glideNow.pitch, 0.005);
    const zoom = takeStep(glideNow.zoom, 0.01);
    const panX = takeStep(glideNow.panX, 1.1);
    const panY = takeStep(glideNow.panY, 1.1);
    glideNow.yaw = yaw.rest;
    glideNow.pitch = pitch.rest;
    glideNow.zoom = zoom.rest;
    glideNow.panX = panX.rest;
    glideNow.panY = panY.rest;
    const coasting = Math.abs(yaw.step) + Math.abs(pitch.step) + Math.abs(zoom.step) + Math.abs(panX.step) + Math.abs(panY.step) > 0.00002;
    if (coasting && controls && !dragging.current) {
      const target = controls.target;
      GLIDE_OFFSET.copy(camera.position).sub(target);
      if (GLIDE_OFFSET.lengthSq() < 1) GLIDE_OFFSET.set(0, 40, 180);
      if (Math.abs(yaw.step) + Math.abs(pitch.step) > 0.00002) {
        YAW_Q.setFromAxisAngle(UP, -yaw.step);
        GLIDE_OFFSET.applyQuaternion(YAW_Q);
        GLIDE_RIGHT.crossVectors(GLIDE_OFFSET, UP);
        if (GLIDE_RIGHT.lengthSq() > 1e-6) {
          GLIDE_RIGHT.normalize();
          PITCH_Q.setFromAxisAngle(GLIDE_RIGHT, -pitch.step);
          GLIDE_OFFSET.applyQuaternion(PITCH_Q);
        }
      }
      if (Math.abs(zoom.step) > 0.00002) {
        const next = GLIDE_OFFSET.length() * Math.exp(zoom.step);
        GLIDE_OFFSET.setLength(THREE.MathUtils.clamp(Number.isFinite(next) ? next : limits.min, limits.min, limits.max));
      }
      camera.position.copy(target).add(GLIDE_OFFSET);
      if (Math.abs(panX.step) + Math.abs(panY.step) > 0.02) {
        const dist = Math.max(limits.min, GLIDE_OFFSET.length());
        GLIDE_RIGHT.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(-panX.step * dist * 0.0011);
        camera.position.add(GLIDE_RIGHT);
        target.add(GLIDE_RIGHT);
        OFFSET.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(panY.step * dist * 0.0011);
        camera.position.add(OFFSET);
        target.add(OFFSET);
      }
      look.current.copy(target);
      ORBIT_TARGET.copy(target);
      camera.up.copy(UP);
      camera.lookAt(target);
    }
    decayGlide(glideNow, delta);
    tuneNear(camera, camera.position.distanceTo(look.current), radius.current);
    if (state.autoRotate && state.present && controls && !dragging.current) {
      OFFSET.copy(camera.position).sub(controls.target);
      OFFSET.applyAxisAngle(UP, delta * 0.28);
      camera.position.copy(controls.target).add(OFFSET);
      camera.up.lerp(UP, 0.02).normalize();
      camera.lookAt(controls.target);
    }
    const shot = takeShot();
    if (shot) shot(gl.domElement.toDataURL("image/png"));
  }, 1);

  useFrame(() => {
    const rig = controls as { target: THREE.Vector3; _lastAngle?: number } | null;
    const target = mode.current === "anim" ? look.current : (rig?.target ?? look.current);
    if (mode.current !== "anim" && poseBroken(camera.position, target, camera.up)) recoverHome();
    const live = mode.current === "anim" ? look.current : (rig?.target ?? look.current);
    clampOrbit(camera, live, radius.current);
    if (mode.current !== "anim") {
      if (rig && typeof rig._lastAngle === "number") {
        rig._lastAngle = THREE.MathUtils.clamp(rig._lastAngle, -0.01, 0.01);
        if (camera.up.dot(UP) < 0.9) rig._lastAngle = 0;
      }
      camera.up.copy(UP);
      if (camera.position.distanceTo(live) > 1) camera.lookAt(live);
      look.current.copy(live);
      if (rig) ORBIT_TARGET.copy(rig.target);
    }
    cameraProbe.x = camera.position.x;
    cameraProbe.y = camera.position.y;
    cameraProbe.z = camera.position.z;
    cameraProbe.tx = look.current.x;
    cameraProbe.ty = look.current.y;
    cameraProbe.tz = look.current.z;
    cameraProbe.finite = Number.isFinite(camera.position.x) && Number.isFinite(look.current.x);
    cameraProbe.flying = sceneSpan.flying;
    cameraProbe.sig = frameSignature(Math.round(size.width), Math.round(size.height));
  }, -1);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as Window & { __labCam?: typeof cameraProbe }).__labCam = cameraProbe;
  }, []);

  return (
    <TrackballControls
      makeDefault
      target={ORBIT_TARGET}
      staticMoving={false}
      dynamicDampingFactor={0.72}
      rotateSpeed={0.38}
      zoomSpeed={0.26}
      panSpeed={0.42}
      minDistance={48}
      maxDistance={2200}
      cursorZoom
      onStart={() => {
        dragging.current = true;
        if (mode.current === "anim") {
          mode.current = "idle";
          sceneSpan.flying = false;
        }
        glide.current.yaw = 0;
        glide.current.pitch = 0;
        glide.current.zoom = 0;
        glide.current.panX = 0;
        glide.current.panY = 0;
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

function StageBlank() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    let x = 0;
    let y = 0;
    let armed = false;
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      clearPartPointer();
      armed = true;
      x = event.clientX;
      y = event.clientY;
    };
    const up = (event: PointerEvent) => {
      if (!armed || event.button !== 0) return;
      armed = false;
      const moved = Math.hypot(event.clientX - x, event.clientY - y) > 6;
      if (consumePartPointer() || moved) return;
      releaseFocus();
    };
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointerup", up);
    };
  }, [gl]);
  return null;
}

function StageFog() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const theme = useLab((s) => s.theme);
  const voice = useLab((s) => s.voice);
  useFrame(() => {
    if (theme === "light") {
      scene.fog = null;
      return;
    }
    const color = voice === 2 ? "#05060a" : "#0c0e14";
    const dist = Math.max(80, camera.position.distanceTo(ORBIT_TARGET));
    const near = dist * 2.4;
    const far = dist * 5.2;
    if (!(scene.fog instanceof THREE.Fog)) scene.fog = new THREE.Fog(color, near, far);
    scene.fog.color.set(color);
    scene.fog.near = near;
    scene.fog.far = far;
  });
  return null;
}

function Stage() {
  const theme = useLab((s) => themes[s.theme]);
  const voice = useLab((s) => s.voice);
  const blueprint = useLab((s) => s.blueprint);
  const stage = useLab((s) => s.stage);
  const dark = theme.id === "dark";
  const showGrid = blueprint || (dark && voice !== 2);
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
      <StageFog />
      <Exposure />
      <PixelRatio />
      <Backdrop />
      <StudioEnv />
      <StudioLights />
      <StageFloor />
      {showGrid && (
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
      {blueprint && stage !== "together" && !(dark && voice === 2) && (
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
      {dark && voice === 2 && (
        <>
          <ParticleField />
          <EnergyRings />
        </>
      )}
      {dark && voice === 3 && <CinematicFloor />}
      <Assembly />
      <StageBlank />
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
