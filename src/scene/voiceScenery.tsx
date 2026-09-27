import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, Glitch, Scanline, Vignette } from "@react-three/postprocessing";
import { GlitchMode } from "postprocessing";
import * as THREE from "three";
import { useLab } from "../store/labStore.ts";
import { computeFit } from "../model/fit.ts";
import { Clock } from "./clock.ts";
import { frameFor } from "./Guides.tsx";

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
    float alpha = fres * 0.42 + scan * 0.16 * band;
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
  const fit = computeFit(design, explodeAmt > 0.45);
  const frame = selected ? frameFor(selected, fit) : null;

  useFrame(({ clock: threeClock }) => {
    if (material.current) material.current.uniforms.uTime.value = threeClock.elapsedTime;
    if (!group.current || !frame) return;
    const span = frame.index * 0.07;
    const t = Math.min(1, Math.max(0, (clock.current - span) / 0.5));
    const local = t * t * (3 - 2 * t);
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
  const count = 150;
  const geometry = useMemo(() => {
    const data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      data[i * 3] = (Math.random() - 0.5) * 240;
      data[i * 3 + 1] = Math.random() * 150;
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
      <pointsMaterial color="#b7dde4" size={1.15} transparent opacity={0.42} depthWrite={false} sizeAttenuation />
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
      material.opacity = 0.16 + Math.sin(t * speed + index) * 0.07;
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
          <meshBasicMaterial color={ring.color} transparent opacity={0.28} depthWrite={false} />
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
    vec3 gold = vec3(0.55, 0.44, 0.24);
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[78, 48]} />
        <meshPhysicalMaterial color="#12151c" metalness={0.92} roughness={0.18} envMapIntensity={1.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
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

export function useSwapPulse(enabled: boolean): boolean {
  const design = useLab((s) => s.design);
  const sig = `${design.bottle.variantId}|${design.cap.variantId}|${design.pump.variantId}|${design.collar.variantId}|${design.label.variantId}|${design.box.variantId}`;
  const seen = useRef(sig);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!enabled) {
      seen.current = sig;
      return;
    }
    if (seen.current === sig) return;
    seen.current = sig;
    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), 420);
    return () => window.clearTimeout(timer);
  }, [enabled, sig]);
  return pulse;
}

export function VoiceGrade() {
  const voice = useLab((s) => s.voice);
  const theme = useLab((s) => s.theme);
  const pulse = useSwapPulse(voice === 3 && theme === "dark");
  if (theme === "light" || voice === 1) {
    return (
      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom intensity={theme === "light" ? 0.05 : 0.045} luminanceThreshold={0.96} luminanceSmoothing={0.2} mipmapBlur radius={0.2} />
      </EffectComposer>
    );
  }
  if (voice === 2) {
    return (
      <EffectComposer enableNormalPass={false} multisampling={0}>
        <DepthOfField worldFocusDistance={175} worldFocusRange={240} bokehScale={1.05} resolutionScale={0.25} />
        <Bloom intensity={0.28} luminanceThreshold={0.74} luminanceSmoothing={0.22} mipmapBlur radius={0.35} />
        <Scanline density={1.15} opacity={0.18} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer enableNormalPass={false} multisampling={0}>
      <Bloom intensity={0.2} luminanceThreshold={0.8} luminanceSmoothing={0.18} mipmapBlur radius={0.32} />
      <Vignette eskil={false} offset={0.22} darkness={0.78} />
      <Glitch
        active={pulse}
        mode={GlitchMode.CONSTANT}
        ratio={0.32}
        strength={[0.04, 0.1]}
        duration={[0.08, 0.16]}
        chromaticAberrationOffset={[0.0015, 0.0025]}
      />
    </EffectComposer>
  );
}
