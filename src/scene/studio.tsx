import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { useLab } from "../store/labStore.ts";

export function Exposure() {
  const theme = useLab((s) => s.theme);
  const voice = useLab((s) => s.voice);
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    const exposure = theme === "light" ? 1.08 : voice === 2 ? 1.3 : voice === 3 ? 1.08 : 1.12;
    gl.toneMappingExposure = exposure;
  }, [gl, theme, voice]);
  return null;
}

export function PixelRatio() {
  
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    const cap = 2;
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  }, [gl]);
  return null;
}

export function StudioEnv() {
  
  const theme = useLab((s) => s.theme);
  const resolution = 256;
  const dark = theme === "dark";
  return (
    <Environment frames={1} resolution={resolution} environmentIntensity={dark ? 1.15 : 1.2}>
      <Lightformer form="rect" intensity={dark ? 4.2 : 3.6} color="#ffffff" position={[0, 5, 4]} scale={[14, 6, 1]} />
      <Lightformer form="rect" intensity={dark ? 1.6 : 1.5} color={dark ? "#d7e0ee" : "#e7eef6"} position={[-6, 2.2, -1]} rotation={[0, Math.PI / 2, 0]} scale={[10, 4, 1]} />
      <Lightformer form="rect" intensity={dark ? 1.5 : 1.35} color="#e8eef6" position={[6, 1.8, 2]} rotation={[0, -Math.PI / 2.4, 0]} scale={[6, 3, 1]} />
      <Lightformer form="rect" intensity={dark ? 1.6 : 1.7} color="#f7f8fa" position={[1.2, 2.4, 6]} scale={[3.2, 7, 1]} />
      {dark && <Lightformer form="ring" intensity={0.18} color="#c5ccd6" position={[0, 0.15, 0]} scale={7} />}
    </Environment>
  );
}

export function StudioLights() {
  const themeId = useLab((s) => s.theme);
  const voice = useLab((s) => s.voice);
  if (themeId === "light") {
    return (
      <>
        <ambientLight color="#f4f6f8" intensity={0.62} />
        <directionalLight position={[48, 110, 72]} color="#ffffff" intensity={2.15} />
        <directionalLight position={[-62, 28, 48]} color="#d5deea" intensity={0.55} />
        <directionalLight position={[-18, 36, -90]} color="#ffffff" intensity={0.42} />
      </>
    );
  }
  return (
    <>
      <ambientLight color="#e7edf4" intensity={voice === 2 ? 0.36 : 0.5} />
      <directionalLight position={[28, 90, 54]} color="#f5f7fb" intensity={voice === 3 ? 3.1 : 2.2} />
      <directionalLight position={[-48, 42, -36]} color="#c9d4e2" intensity={voice === 3 ? 1.6 : 0.9} />
      <directionalLight position={[18, 24, 70]} color="#f7f8fa" intensity={0.62} />
      <directionalLight position={[60, 18, 10]} color="#d5e4f4" intensity={0.42} />
    </>
  );
}

export function StageFloor() {
  
  const theme = useLab((s) => s.theme);
  const voice = useLab((s) => s.voice);
  const explode = useLab((s) => s.explode);
  const light = theme === "light";
  const bucket = Math.round(explode * 6);
  if (!light && voice === 2) return null;
  return (
    <>
      {true && (
        <ContactShadows
          key={bucket}
          position={[0, 0.04, 0]}
          opacity={light ? 0.16 : 0.38}
          scale={180}
          blur={3.6}
          far={140}
          resolution={256}
          frames={1}
          color={light ? "#8b939e" : "#05070c"}
        />
      )}
    </>
  );
}
