import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useLab } from "../../store/labStore.ts";
import { assemblyBounds, readStageFrame } from "../framing.ts";
import { cameraProbe } from "../limits.ts";
import { UNBOX_CAMERA_SPLIT, getUnboxPlayback } from "./playback.ts";
import { approachPose, heroPose, tuneUnboxCamera } from "./hero.ts";

const FROM_POS = new THREE.Vector3();
const FROM_LOOK = new THREE.Vector3();
const APPROACH_POS = new THREE.Vector3();
const APPROACH_LOOK = new THREE.Vector3();
const HERO_POS = new THREE.Vector3();
const HERO_LOOK = new THREE.Vector3();
const POS = new THREE.Vector3();
const LOOK = new THREE.Vector3();

function lerpPose(t: number, aPos: THREE.Vector3, aLook: THREE.Vector3, bPos: THREE.Vector3, bLook: THREE.Vector3): void {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  POS.lerpVectors(aPos, bPos, u);
  LOOK.lerpVectors(aLook, bLook, u);
}

/**
 * Applies the cinematic camera and the light sweep. GSAP stays out of this
 * file so the first-load canvas chunk does not pull it in.
 */
export function UnboxDirector() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const light = useRef<THREE.DirectionalLight>(null);
  const runSeen = useRef(0);
  const applied = useRef(0);
  const radius = useRef(48);
  const posedKey = useRef("");

  useFrame(() => {
    const play = getUnboxPlayback();
    const playing = play.phase === "playing";
    const finishing = !playing && play.cameraToken !== applied.current;
    const sheen = playing ? play.sheen : 0;
    const sweep = playing ? play.sweep : 0;
    if (light.current) {
      light.current.intensity = sheen * 3.1;
      light.current.position.set(-110 + sweep * 220, 78, 36);
    }
    if (!playing && !finishing) return;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const design = useLab.getState().design;
    const box = design.box;
    const poseKey = `${box.structure}|${box.shape?.type}|${box.liftOff?.variant}|${box.widthMm}|${box.heightMm}|${box.depthMm}|${gl.domElement.clientWidth}|${gl.domElement.clientHeight}`;
    if (poseKey !== posedKey.current || finishing) {
      posedKey.current = poseKey;
      const frame = readStageFrame(gl.domElement);
      const approach = approachPose(design, frame, camera.fov);
      const hero = heroPose(design, frame, camera.fov);
      APPROACH_POS.copy(approach.position);
      APPROACH_LOOK.copy(approach.target);
      HERO_POS.copy(hero.position);
      HERO_LOOK.copy(hero.target);
      const bounds = assemblyBounds(design, 0, "box", true);
      radius.current = Math.max(18, bounds.getBoundingSphere(new THREE.Sphere()).radius);
    }

    if (finishing) {
      applied.current = play.cameraToken;
      camera.position.copy(HERO_POS);
      camera.up.set(0, 1, 0);
      camera.lookAt(HERO_LOOK);
      play.look = { x: HERO_LOOK.x, y: HERO_LOOK.y, z: HERO_LOOK.z };
      play.snap = { x: HERO_POS.x, y: HERO_POS.y, z: HERO_POS.z };
      tuneUnboxCamera(camera, camera.position.distanceTo(HERO_LOOK), radius.current);
      return;
    }

    if (play.runToken !== runSeen.current) {
      runSeen.current = play.runToken;
      FROM_POS.copy(camera.position);
      if (cameraProbe.finite) FROM_LOOK.set(cameraProbe.tx, cameraProbe.ty, cameraProbe.tz);
      else FROM_LOOK.copy(APPROACH_LOOK);
    }

    const t = play.camera;
    if (t <= UNBOX_CAMERA_SPLIT) {
      lerpPose(t / UNBOX_CAMERA_SPLIT, FROM_POS, FROM_LOOK, APPROACH_POS, APPROACH_LOOK);
    } else {
      lerpPose((t - UNBOX_CAMERA_SPLIT) / (1 - UNBOX_CAMERA_SPLIT), APPROACH_POS, APPROACH_LOOK, HERO_POS, HERO_LOOK);
    }
    camera.position.copy(POS);
    camera.up.set(0, 1, 0);
    camera.lookAt(LOOK);
    play.look = { x: LOOK.x, y: LOOK.y, z: LOOK.z };
    play.snap = { x: POS.x, y: POS.y, z: POS.z };
    tuneUnboxCamera(camera, camera.position.distanceTo(LOOK), radius.current);
  });

  return <directionalLight ref={light} color="#fff4e0" intensity={0} />;
}
