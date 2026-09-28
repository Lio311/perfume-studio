import { Component, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Scanline, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { SMAAPreset, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { useLab } from "../store/labStore.ts";
import { computeFit } from "../model/fit.ts";
import { Clock } from "./clock.ts";
import { explodeLocal } from "./explodeCurve.ts";
import { posedFrame } from "./Guides.tsx";

const HOLO_VERT = `
  varying vec3 vWorld;
  varying vec3 vNorm;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNorm = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HOLO_FRAG = `
  varying vec3 vWorld;
  varying vec3 vNorm;
  uniform float uTime;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(normalize(vNorm), viewDir)), 1.8);
    float scan = smoothstep(0.42, 0.5, fract(vWorld.y * 0.09 - uTime * 0.28));
    float band = smoothstep(0.0, 0.08, abs(fract(vWorld.y * 0.02 - uTime * 0.08) - 0.5));
    vec3 cyan = vec3(0.62, 0.84, 0.86);
    vec3 gold = vec3(0.84, 0.7, 0.42);
    vec3 color = mix(cyan, gold, fres);
    float alpha = fres * 0.055 + scan * 0.018 * band;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function HoloShell() {
  const voice = useLab((s) => s.voice);
  const selected = useLab((s) => s.selected);
  const mode = useLab((s) => s.mode);
  const design = useLab((s) => s.design);
  const explodeAmt = useLab((s) => s.explode);
  const material = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const clock = useContext(Clock);
  const stage = useLab((s) => s.stage);
  const fit = computeFit(design, explodeAmt > 0.45);
  const frame = selected ? posedFrame(selected, fit, stage) : null;

  useFrame(({ clock: threeClock }) => {
    if (material.current) material.current.uniforms.uTime.value = threeClock.elapsedTime;
    if (!group.current || !frame) return;
    const local = explodeLocal(frame.index, clock.current);
    group.current.position.set(
      frame.home[0] + frame.explode[0] * local,
      frame.home[1] + frame.explode[1] * local,
      frame.home[2] + frame.explode[2] * local,
    );
  });

  if (voice !== 2 || !frame || !selected || mode === "compare" || !design[selected].visible) return null;
  const [w, h, d] = frame.size;
  return (
    <group ref={group} position={frame.home}>
      <mesh position={frame.center}>
        <boxGeometry args={[w + 1.6, h + 1.6, d + 1.6]} />
        <shaderMaterial
          ref={material}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          uniforms={{ uTime: { value: 0 } }}
          vertexShader={HOLO_VERT}
          fragmentShader={HOLO_FRAG}
        />
      </mesh>
    </group>
  );
}

export function ParticleField() {
  const points = useRef<THREE.Points>(null);
  const count = 26;
  const geometry = useMemo(() => {
    const data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      data[i * 3] = (Math.random() - 0.5) * 220;
      data[i * 3 + 1] = 6 + Math.random() * 70;
      data[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(data, 3));
    return buffer;
  }, []);
  useFrame((_, dt) => {
    if (points.current) points.current.rotation.y += dt * 0.015;
  });
  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial color="#b7dde4" size={0.55} transparent opacity={0.1} depthWrite={false} sizeAttenuation />
    </points>
  );
}

export function EnergyRings() {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const root = group.current;
    if (!root) return;
    root.children.forEach((child, index) => {
      const mesh = child as THREE.Mesh;
      const speed = 0.45 + index * 0.17;
      const pulse = 1 + Math.sin(t * speed) * 0.035;
      mesh.scale.setScalar(pulse);
      mesh.rotation.z = t * (0.12 + index * 0.05);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.035 + Math.sin(t * speed + index) * 0.012;
    });
  });
  const rings = [
    { radius: 46, color: "#9fd4e0" },
    { radius: 64, color: "#d6b26a" },
    { radius: 86, color: "#7eb8c4" },
  ];
  return (
    <group ref={group} position={[0, 0.35, 0]}>
      {rings.map((ring) => (
        <mesh key={ring.radius} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[ring.radius, ring.radius + 0.7, 96]} />
          <meshBasicMaterial color={ring.color} transparent opacity={0.06} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

const GRID_FRAG = `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    vec2 p = (vUv - 0.5) * 360.0;
    float dist = length(p);
    vec2 cell = abs(fract((p + vec2(uTime * 6.0, 0.0)) / 24.0) - 0.5);
    float line = smoothstep(0.47, 0.5, max(cell.x, cell.y));
    float fade = 1.0 - smoothstep(48.0, 170.0, dist);
    vec3 base = vec3(0.04, 0.045, 0.055);
    vec3 gold = vec3(0.42, 0.4, 0.32);
    vec3 color = mix(base, gold, line * 0.85);
    gl_FragColor = vec4(color, fade * (0.22 + line * 0.55));
  }
`;

export function CinematicFloor() {
  const grid = useRef<THREE.ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (grid.current) grid.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.35, 0]}>
        <planeGeometry args={[360, 360]} />
        <shaderMaterial
          ref={grid}
          transparent
          depthWrite={false}
          uniforms={{ uTime: { value: 0 } }}
          vertexShader="varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
          fragmentShader={GRID_FRAG}
        />
      </mesh>
    </group>
  );
}

export function MinimalRing() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
      <ringGeometry args={[54.6, 55.15, 128]} />
      <meshBasicMaterial color="#f4f1ea" transparent opacity={0.45} depthWrite={false} />
    </mesh>
  );
}

class GradeBoundary extends Component<{ children: ReactNode; onFail: () => void }, { dead: boolean }> {
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

function GradeWatch({ onFail }: { onFail: () => void }) {
  const voice = useLab((s) => s.voice);
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current || voice !== 3) return;
    frames.current += 1;
    if (frames.current < 28) return;
    done.current = true;
    const ctx = gl.getContext();
    const width = ctx.drawingBufferWidth;
    const height = ctx.drawingBufferHeight;
    if (width < 2 || height < 2) return;
    const pixel = new Uint8Array(4);
    let brightest = 0;
    const samples: Array<[number, number]> = [
      [0.5, 0.58],
      [0.5, 0.46],
      [0.44, 0.52],
      [0.6, 0.52],
      [0.5, 0.7],
      [0.36, 0.4],
    ];
    try {
      for (const [fx, fy] of samples) {
        ctx.readPixels(Math.floor(width * fx), Math.floor(height * fy), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel);
        brightest = Math.max(brightest, pixel[0] + pixel[1] + pixel[2]);
      }
    } catch {
      onFail();
      return;
    }
    if (brightest < 8) onFail();
  }, 2);
  return null;
}

function GradePasses() {
  const voice = useLab((s) => s.voice);
  const theme = useLab((s) => s.theme);
  
  const samples = 4;
  const smooth = <SMAA preset={SMAAPreset.HIGH} />;
  // The composer forces NoToneMapping on the renderer and copies a half-float buffer to the
  // screen. Without this pass, a lit cream face (radiance above 1) clips to pure white while
  // the unlit backdrop, which is already in display range, stays normal.
  const grade = <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />;
  if (theme === "light" || voice === 1) {
    return (
      <EffectComposer enableNormalPass={false} multisampling={samples}>
        <Bloom intensity={theme === "light" ? 0.05 : 0.045} luminanceThreshold={0.96} luminanceSmoothing={0.2} mipmapBlur radius={0.2} />
        {grade}
        {smooth}
      </EffectComposer>
    );
  }
  if (voice === 2) {
    return (
      <EffectComposer enableNormalPass={false} multisampling={samples}>
        <Bloom intensity={0.12} luminanceThreshold={0.86} luminanceSmoothing={0.2} mipmapBlur radius={0.28} />
        {grade}
        {smooth}
        <Scanline density={0.55} opacity={0.028} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer enableNormalPass={false} multisampling={samples}>
      <Bloom intensity={0.35} luminanceThreshold={0.78} luminanceSmoothing={0.2} mipmapBlur radius={0.32} />
      {grade}
      {smooth}
      <Vignette eskil={false} offset={0.35} darkness={0.42} />
    </EffectComposer>
  );
}

export function VoiceGrade() {
  const gl = useThree((s) => s.gl);
  const [off, setOff] = useState(false);
  if (off || !gl.capabilities.isWebGL2) return null;
  const fail = () => setOff(true);
  return (
    <GradeBoundary onFail={fail}>
      <GradePasses />
      <GradeWatch onFail={fail} />
    </GradeBoundary>
  );
}
