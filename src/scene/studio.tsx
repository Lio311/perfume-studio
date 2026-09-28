import { useLayoutEffect, useMemo } from "react";
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
    const exposure = theme === "light" ? 1.05 : voice === 2 ? 1.3 : voice === 3 ? 1.08 : 1.12;
    gl.toneMappingExposure = exposure;
  }, [gl, theme, voice]);
  return null;
}

export function PixelRatio() {
  const quality = useLab((s) => s.quality);
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    const cap = quality === "high" ? 1.5 : 1.1;
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  }, [gl, quality]);
  return null;
}

export function StudioEnv() {
  const quality = useLab((s) => s.quality);
  const theme = useLab((s) => s.theme);
  const resolution = quality === "high" ? 256 : 128;
  const dark = theme === "dark";
  return (
    <Environment frames={1} resolution={resolution} environmentIntensity={dark ? 1.25 : 1}>
      <Lightformer form="rect" intensity={dark ? 4.4 : 3.2} color={dark ? "#fff8ef" : "#ffffff"} position={[0, 5, 4]} scale={[14, 6, 1]} />
      <Lightformer form="rect" intensity={dark ? 2.4 : 1.4} color="#f3d7a2" position={[-6, 2.2, -1]} rotation={[0, Math.PI / 2, 0]} scale={[10, 4, 1]} />
      <Lightformer form="rect" intensity={dark ? 1.5 : 1.1} color={dark ? "#d7e6f6" : "#e7eef6"} position={[6, 1.8, 2]} rotation={[0, -Math.PI / 2.4, 0]} scale={[6, 3, 1]} />
      <Lightformer form="rect" intensity={dark ? 1.8 : 1} color="#fff4e2" position={[1.2, 2.4, 6]} scale={[3.2, 7, 1]} />
      <Lightformer form="ring" intensity={dark ? 0.45 : 0.25} color="#e7c48a" position={[0, 0.15, 0]} scale={7} />
    </Environment>
  );
}

export function StudioLights() {
  const themeId = useLab((s) => s.theme);
  const voice = useLab((s) => s.voice);
  if (themeId === "light") {
    return (
      <>
        <ambientLight color="#fff8ef" intensity={0.55} />
        <directionalLight position={[48, 110, 72]} color="#ffffff" intensity={2.3} />
        <directionalLight position={[-62, 28, 48]} color="#f0e4d4" intensity={0.7} />
        <directionalLight position={[-18, 36, -90]} color="#ffffff" intensity={0.45} />
      </>
    );
  }
  return (
    <>
      <ambientLight color="#f7f1e6" intensity={voice === 2 ? 0.38 : 0.48} />
      <directionalLight position={[28, 90, 54]} color="#fffaf3" intensity={voice === 3 ? 3.3 : 2.05} />
      <directionalLight position={[-48, 42, -36]} color="#f0d29a" intensity={voice === 3 ? 2.1 : 1.25} />
      <directionalLight position={[18, 24, 70]} color="#fff1dc" intensity={0.72} />
      <directionalLight position={[60, 18, 10]} color="#d5e4f4" intensity={0.38} />
      <pointLight position={[8, 36, 42]} color="#ffd7a2" intensity={6} distance={260} decay={2} />
    </>
  );
}

const FLOOR_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLOOR_FRAG = `
  varying vec2 vUv;
  uniform vec3 uMirror;
  uniform vec3 uGold;
  uniform float uLight;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float fade = smoothstep(1.0, 0.18, r);
    float pool = exp(-r * r * 4.4);
    float sheen = smoothstep(0.75, 0.05, r) * (0.035 + uLight * 0.04);
    vec3 color = uMirror * (0.72 + sheen * 2.0);
    color += uGold * pool * (0.16 + uLight * 0.05);
    float alpha = fade * (0.94 - uLight * 0.08);
    gl_FragColor = vec4(color, alpha);
  }
`;

export function StageFloor() {
  const quality = useLab((s) => s.quality);
  const theme = useLab((s) => s.theme);
  const voice = useLab((s) => s.voice);
  const explode = useLab((s) => s.explode);
  const light = theme === "light";
  const bucket = Math.round(explode * 6);
  const uniforms = useMemo(() => ({
    uMirror: { value: new THREE.Color(light ? "#9a958e" : "#12141a") },
    uGold: { value: new THREE.Color("#D6B26A") },
    uLight: { value: light ? 1 : 0 },
  }), [light]);
  if (!light && voice === 2) return null;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} frustumCulled={false}>
        <circleGeometry args={[720, 72]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          toneMapped={false}
          uniforms={uniforms}
          vertexShader={FLOOR_VERT}
          fragmentShader={FLOOR_FRAG}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[38, 39.2, 96]} />
        <meshBasicMaterial color="#D6B26A" transparent opacity={light ? 0.28 : 0.45} depthWrite={false} />
      </mesh>
      {quality === "high" && (
        <ContactShadows
          key={bucket}
          position={[0, 0.08, 0]}
          opacity={light ? 0.22 : 0.45}
          scale={120}
          blur={2.6}
          far={80}
          resolution={256}
          frames={1}
          color="#000000"
        />
      )}
    </>
  );
}
