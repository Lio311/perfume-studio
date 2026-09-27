import { Component, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";
import { useLab } from "../store/labStore.ts";

export function Exposure() {
  const theme = useLab((s) => s.theme);
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = theme === "dark" ? 1.48 : 1.15;
  }, [gl, theme]);
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
    <Environment frames={1} resolution={resolution} environmentIntensity={dark ? 1.55 : 1.05}>
      <Lightformer form="rect" intensity={dark ? 6.5 : 3.4} color={dark ? "#fff8ef" : "#ffffff"} position={[0, 5, 4]} scale={[14, 6, 1]} />
      <Lightformer form="rect" intensity={dark ? 3.6 : 1.6} color="#f3d7a2" position={[-6, 2.2, -1]} rotation={[0, Math.PI / 2, 0]} scale={[10, 4, 1]} />
      <Lightformer form="rect" intensity={dark ? 2.2 : 1.2} color={dark ? "#d7e6f6" : "#e7eef6"} position={[6, 1.8, 2]} rotation={[0, -Math.PI / 2.4, 0]} scale={[6, 3, 1]} />
      <Lightformer form="rect" intensity={dark ? 2.8 : 1.2} color="#fff4e2" position={[1.2, 2.4, 6]} scale={[3.2, 7, 1]} />
      <Lightformer form="ring" intensity={dark ? 0.7 : 0.3} color="#e7c48a" position={[0, 0.15, 0]} scale={7} />
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
      <ambientLight color="#f7f1e6" intensity={voice === 2 ? 0.42 : 0.55} />
      <directionalLight position={[28, 90, 54]} color="#fffaf3" intensity={voice === 3 ? 3.4 : 2.9} />
      <directionalLight position={[-48, 42, -36]} color="#f0d29a" intensity={voice === 3 ? 2.4 : 1.85} />
      <directionalLight position={[18, 24, 70]} color="#fff1dc" intensity={1.15} />
      <directionalLight position={[60, 18, 10]} color="#d5e4f4" intensity={0.55} />
      <pointLight position={[8, 36, 42]} color="#ffd7a2" intensity={18} distance={0} decay={0} />
    </>
  );
}

class FloorBoundary extends Component<{ children: ReactNode; onFail: () => void }, { dead: boolean }> {
  state = { dead: false };
  static getDerivedStateFromError(): { dead: boolean } {
    return { dead: true };
  }
  componentDidCatch(): void {
    this.props.onFail();
  }
  render(): ReactNode {
    return this.state.dead ? null : this.props.children;
  }
}

function MirrorWatch({ onFail }: { onFail: () => void }) {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    frames.current += 1;
    if (frames.current < 36) return;
    done.current = true;
    const ctx = gl.getContext();
    const width = ctx.drawingBufferWidth;
    const height = ctx.drawingBufferHeight;
    if (width < 2 || height < 2) return;
    const pixel = new Uint8Array(4);
    let brightest = 0;
    try {
      for (const [fx, fy] of [
        [0.5, 0.55],
        [0.46, 0.48],
        [0.56, 0.62],
        [0.5, 0.4],
      ] as const) {
        ctx.readPixels(Math.floor(width * fx), Math.floor(height * fy), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel);
        brightest = Math.max(brightest, pixel[0] + pixel[1] + pixel[2]);
      }
    } catch {
      onFail();
      return;
    }
    if (brightest < 36) onFail();
  });
  return null;
}

function PlainFloor({ light }: { light: boolean }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <circleGeometry args={[120, 64]} />
      <meshPhysicalMaterial color={light ? "#d8d0c4" : "#1c212c"} metalness={0.78} roughness={0.26} envMapIntensity={1.25} />
    </mesh>
  );
}

export function StageFloor() {
  const quality = useLab((s) => s.quality);
  const theme = useLab((s) => s.theme);
  const explode = useLab((s) => s.explode);
  const [off, setOff] = useState(false);
  const light = theme === "light";
  const mirror = quality === "high" && !off;
  const bucket = Math.round(explode * 6);
  return (
    <>
      {mirror ? (
        <FloorBoundary onFail={() => setOff(true)}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <circleGeometry args={[130, 64]} />
            <MeshReflectorMaterial
              resolution={512}
              mixBlur={0.85}
              mixStrength={0.65}
              roughness={0.7}
              mirror={0.38}
              blur={[220, 70]}
              minDepthThreshold={0.35}
              maxDepthThreshold={1.25}
              depthScale={0.45}
              color={light ? "#cfc6ba" : "#1c2430"}
              metalness={0.55}
            />
          </mesh>
          <MirrorWatch onFail={() => setOff(true)} />
        </FloorBoundary>
      ) : (
        <PlainFloor light={light} />
      )}
      {quality === "high" && (
        <ContactShadows
          key={bucket}
          position={[0, 0.08, 0]}
          opacity={light ? 0.28 : 0.48}
          scale={150}
          blur={2.4}
          far={70}
          resolution={256}
          frames={1}
          color="#000000"
        />
      )}
    </>
  );
}
