import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useLab } from "../../store/labStore.ts";
import { readStageFrame } from "../framing.ts";
import { getUnboxPlayback } from "./playback.ts";
import { bottleHeroBounds, heroPose, tuneUnboxCamera, widePose } from "./hero.ts";

const WIDE_POS = new THREE.Vector3();
const WIDE_LOOK = new THREE.Vector3();
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
      light.current.intensity = playing ? 1.4 + sheen * 7.5 : 0;
      light.current.position.set(-140 + sweep * 280, 96, -48);
    }
    if (!playing && !finishing) return;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const design = useLab.getState().design;
    const box = design.box;
    const poseKey = `${box.structure}|${box.shape?.type}|${box.liftOff?.variant}|${box.widthMm}|${box.heightMm}|${box.depthMm}|${gl.domElement.clientWidth}|${gl.domElement.clientHeight}`;
    if (poseKey !== posedKey.current || finishing) {
      posedKey.current = poseKey;
      const frame = readStageFrame(gl.domElement);
      const wide = widePose(design, frame, camera.fov);
      const hero = heroPose(design, frame, camera.fov);
      WIDE_POS.copy(wide.position);
      WIDE_LOOK.copy(wide.target);
      HERO_POS.copy(hero.position);
      HERO_LOOK.copy(hero.target);
      radius.current = Math.max(18, bottleHeroBounds(design).getBoundingSphere(new THREE.Sphere()).radius);
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

    lerpPose(play.camera, WIDE_POS, WIDE_LOOK, HERO_POS, HERO_LOOK);
    camera.position.copy(POS);
    camera.up.set(0, 1, 0);
    camera.lookAt(LOOK);
    play.look = { x: LOOK.x, y: LOOK.y, z: LOOK.z };
    play.snap = { x: POS.x, y: POS.y, z: POS.z };
    tuneUnboxCamera(camera, camera.position.distanceTo(LOOK), radius.current);
  });

  return <directionalLight ref={light} color="#fff4e0" intensity={0} />;
}
