import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { BoxBoard, FinishId, WrapFinish } from "../model/types.ts";
import { computeGlassProps, isGlass } from "../model/materials.ts";
import { leatherBump, woodMap } from "../geometry/textures.ts";
import { paperMaps, velvetMaps } from "../geometry/wrapTextures.ts";
import { useLab } from "../store/labStore.ts";
import { sectionPlanes } from "./sectionPlane.ts";
import { getUnboxPlayback } from "./unbox/playback.ts";
import { useUnboxPlaying } from "./unbox/useUnboxPlaying.ts";

const BLUE_VERT = `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;
  void main() {
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const BLUE_FRAG = `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;
  uniform float uFade;
  uniform vec3 uColor;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 view = normalize(vView);
    float fres = pow(1.0 - abs(dot(n, view)), 1.7);
    float ang = atan(vPos.x, vPos.z);
    float spokes = abs(fract(ang / 6.2831853 * 16.0) - 0.5);
    float rings = abs(fract(vPos.y * 0.07) - 0.5);
    float spokeLine = 1.0 - smoothstep(0.015, 0.07, spokes);
    float ringLine = 1.0 - smoothstep(0.015, 0.07, rings);
    float cage = max(spokeLine, ringLine * 0.85);
    float alpha = clamp(0.07 + fres * 0.78 + cage * 0.42, 0.0, 0.95);
    gl_FragColor = vec4(uColor, alpha * uFade);
  }
`;

/**
 * Neutral fibre albedo, multiplied by the finish colour.
 * A white map leaves cream (#f4efe6) no headroom under the studio key, so the face
 * tone-maps flat. This gray stays a tint, and the fibres are large enough to read.
 */
export const MATTE_PAPER_ALBEDO = "#8f887c";

function mattePaper(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bumpCtx = bumpCanvas.getContext("2d");
  if (ctx && bumpCtx) {
    ctx.fillStyle = MATTE_PAPER_ALBEDO;
    ctx.fillRect(0, 0, 256, 256);
    bumpCtx.fillStyle = "#808080";
    bumpCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 220; i += 1) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const len = 16 + Math.random() * 36;
      const thick = 1.3 + Math.random() * 1.6;
      const n = Math.random() > 0.5 ? 108 + Math.random() * 18 : 156 + Math.random() * 22;
      ctx.globalAlpha = 0.32 + Math.random() * 0.28;
      ctx.fillStyle = `rgb(${n | 0},${Math.max(0, n - 10) | 0},${Math.max(0, n - 18) | 0})`;
      ctx.fillRect(x, y, len, thick);
      const bump = n > 140 ? 158 : 96;
      bumpCtx.fillStyle = `rgb(${bump},${bump},${bump})`;
      bumpCtx.fillRect(x, y, len, thick);
    }
    ctx.globalAlpha = 1;
  }
  const map = new THREE.CanvasTexture(canvas);
  const bump = new THREE.CanvasTexture(bumpCanvas);
  for (const texture of [map, bump]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.35, 1.35);
  }
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  map.magFilter = THREE.LinearFilter;
  bump.generateMipmaps = false;
  bump.minFilter = THREE.LinearFilter;
  bump.magFilter = THREE.LinearFilter;
  return { map, bump };
}

const CLEAR_VERT = `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CLEAR_FRAG = `
  varying vec3 vNormal;
  varying vec3 vWorld;
  uniform float uFade;
  uniform float uOpacity;
  uniform float uReveal;
  uniform float uSweep;
  uniform vec3 uTint;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = max(dot(N, V), 0.0);
    float fresSoft = pow(1.0 - ndv, 2.45);
    float fresHard = pow(1.0 - ndv, 1.45);
    float fres = mix(fresSoft, fresHard, uReveal);
    vec3 R = reflect(-V, N);
    float envH = clamp(R.y * 0.5 + 0.58, 0.0, 1.0);
    vec3 env = mix(vec3(0.74, 0.77, 0.81), vec3(0.98, 0.985, 0.99), envH);
    vec3 L = normalize(mix(vec3(0.22, 0.92, 0.34), vec3(-0.9 + uSweep * 1.8, 0.62, 0.38), uReveal));
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), mix(70.0, 26.0, uReveal));
    float tintAmt = clamp(uOpacity * 1.15, 0.0, 1.0);
    vec3 tint = mix(vec3(0.97, 0.98, 0.99), uTint, tintAmt);
    vec3 color = mix(env * 0.55, tint, fres);
    color += vec3(1.0) * spec * 0.9;
    vec3 revealColor = mix(vec3(0.50, 0.58, 0.68), vec3(0.20, 0.24, 0.30), fresHard);
    revealColor += vec3(1.0) * spec * 1.45;
    color = mix(color, revealColor, uReveal);
    float cover = 0.08 + clamp(uOpacity, 0.0, 1.0) * 0.92;
    float revealCover = 0.62 + fresHard * 0.32;
    cover = mix(cover, revealCover, uReveal);
    gl_FragColor = vec4(color, cover * uFade);
  }
`;

function ClearGlass({ opacity = 0.14, color = "#f4f0e8", clippingPlanes, reveal = false }: { opacity?: number; color?: string; clippingPlanes?: THREE.Plane[]; reveal?: boolean }) {
  const ref = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uFade: { value: 1 },
      uOpacity: { value: opacity },
      uTint: { value: new THREE.Color(color) },
      uReveal: { value: reveal ? 1 : 0 },
      uSweep: { value: 0.35 },
    }),
    [],
  );
  const opacityRef = useRef(opacity);
  const colorRef = useRef(color);
  const revealRef = useRef(reveal);
  opacityRef.current = opacity;
  colorRef.current = color;
  revealRef.current = reveal;
  // Fiber copies uniforms onto the material, so slider changes have to write that copy.
  useFrame(() => {
    const material = ref.current;
    if (!material?.uniforms?.uOpacity) return;
    const amount = opacityRef.current;
    const showing = revealRef.current ? 1 : 0;
    const sweep = showing > 0 && getUnboxPlayback().phase === "playing" ? getUnboxPlayback().sweep : 0.35;
    uniforms.uOpacity.value = amount;
    uniforms.uReveal.value = showing;
    uniforms.uSweep.value = sweep;
    material.uniforms.uOpacity.value = amount;
    material.uniforms.uReveal.value = showing;
    material.uniforms.uSweep.value = sweep;
    uniforms.uTint.value.set(colorRef.current);
    material.uniforms.uTint.value.set(colorRef.current);
  });
  return (
    <shaderMaterial
      ref={ref}
      transparent
      depthWrite={false}
      depthTest
      side={THREE.FrontSide}
      polygonOffset
      polygonOffsetFactor={-1}
      polygonOffsetUnits={-1}
      uniforms={uniforms}
      vertexShader={CLEAR_VERT}
      fragmentShader={CLEAR_FRAG}
      clippingPlanes={clippingPlanes}
    />
  );
}

export function FinishMaterial({
  finish,
  color,
  opacity,
  flat = false,
  glass = false,
  section = false,
}: {
  finish: FinishId;
  color: string;
  opacity?: number | null;
  flat?: boolean;
  glass?: boolean;
  section?: boolean;
}) {
  const wood = useMemo(() => (finish === "wood" ? woodMap() : null), [finish]);
  const leather = useMemo(() => (finish === "leather" ? leatherBump() : null), [finish]);
  const paper = useMemo(() => (finish === "matteBlack" ? mattePaper() : null), [finish]);

  useEffect(() => {
    return () => {
      if (wood) wood.dispose();
      if (leather) leather.dispose();
      if (paper) {
        paper.map.dispose();
        paper.bump.dispose();
      }
    };
  }, [wood, leather, paper]);
  const glassLike = glass && isGlass(finish);
  const gp = useMemo(
    () => (glassLike ? computeGlassProps(finish, opacity ?? undefined) : null),
    [glassLike, finish, opacity],
  );
  const metal = finish === "gold" || finish === "silver" || finish === "rose";
  const blueprint = useLab((s) => s.blueprint);
  const theme = useLab((s) => s.theme);
  const quality = useLab((s) => s.quality);
  const cutaway = useLab((s) => s.cutaway);
  const matte = finish === "matteBlack";
  const clear = finish === "clear";
  const playing = useUnboxPlaying();
  const cartonOpen = useLab((s) => (s.boxOpen || playing) && s.stage === "box");
  const clearHigh = clear && glass && (quality === "high" || cartonOpen);
  const planes = section && cutaway ? sectionPlanes : undefined;
  const fade = useMemo(() => ({ uFade: { value: 1 }, uColor: { value: new THREE.Color() } }), []);
  useEffect(() => {
    fade.uColor.value.set(theme === "dark" ? 0xf6e5c7 : 0x2c3e50);
  }, [theme, fade]);

  const meshRef = useRef<THREE.MeshPhysicalMaterial>(null);
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData.intendedOpacity = gp ? gp.materialOpacity : 1.0;
    }
  }, [gp]);

  if (blueprint) {
    return <shaderMaterial transparent depthWrite toneMapped={false} uniforms={fade} vertexShader={BLUE_VERT} fragmentShader={BLUE_FRAG} clippingPlanes={planes} />;
  }
  if (clear && glass && cartonOpen) {
    return <ClearGlass reveal opacity={typeof opacity === "number" ? opacity : 0.14} color={color} clippingPlanes={planes} />;
  }
  if (clear && glass && !clearHigh) return <ClearGlass opacity={typeof opacity === "number" ? opacity : 0.14} color={color} clippingPlanes={planes} />;

  return (
    <meshPhysicalMaterial
      ref={meshRef}
      color={color}
      flatShading={flat}
      map={wood ?? paper?.map ?? undefined}
      bumpMap={leather ?? paper?.bump ?? undefined}
      bumpScale={leather ? 0.35 : paper ? 0.55 : 0}
      emissive="#000000"
      emissiveIntensity={0}
      metalness={metal ? 1 : 0}
      roughness={gp ? gp.roughness : metal ? 0.22 : matte ? 0.68 : finish === "wood" ? 0.7 : 0.84}
      sheen={matte ? 0.06 : 0}
      sheenRoughness={0.62}
      sheenColor="#4a4f56"
      transmission={gp ? gp.transmission : 0}
      thickness={gp ? gp.thickness : 0}
      ior={gp ? gp.ior : 1.5}
      clearcoat={gp ? 1 : metal ? 0.65 : 0.04}
      clearcoatRoughness={metal ? 0.12 : 0.04}
      attenuationColor={gp ? color : "#fff8ee"}
      attenuationDistance={gp ? 36 : 160}
      envMapIntensity={metal ? 1.65 : gp ? (cartonOpen ? 2.4 : 1.7) : matte ? 0.08 : 0.7}
      clippingPlanes={planes}
      specularIntensity={gp || metal ? 1 : matte ? 0.4 : 0.3}
      transparent={!!gp}
      opacity={gp ? gp.materialOpacity : 1}
      depthWrite={!gp}
      side={THREE.FrontSide}
    />
  );
}

/** Roughness and environment of the board the carton mark has to match. */
export function boardSurface(board: BoxBoard, finish: WrapFinish): { roughness: number; envMapIntensity: number } {
  const gloss = finish === "gloss";
  const pile = finish === "velvet";
  const soft = finish === "soft-touch";
  return {
    roughness: gloss ? 0.16 : pile ? 0.82 : soft ? 0.72 : board === "carton" ? 0.86 : 0.8,
    envMapIntensity: gloss ? 0.9 : pile ? 0.55 : soft ? 0.32 : 0.4,
  };
}

export function WrapMaterial({
  color,
  finish,
  board,
  section = false,
}: {
  color: string;
  finish: WrapFinish;
  board: BoxBoard;
  section?: boolean;
}) {
  const cutaway = useLab((s) => s.cutaway);
  const paper = useMemo(() => {
    if (finish !== "paper-texture" && finish !== "matte" && finish !== "soft-touch") return null;
    const maps = paperMaps();
    if (finish !== "soft-touch") return maps;
    const map = maps.map.clone();
    const rough = maps.rough.clone();
    map.repeat.set(2.6, 2.6);
    rough.repeat.set(2.6, 2.6);
    map.needsUpdate = true;
    rough.needsUpdate = true;
    return { map, rough };
  }, [finish]);
  const velvet = useMemo(() => (finish === "velvet" ? velvetMaps() : null), [finish]);
  useEffect(() => {
    if (finish !== "soft-touch" || !paper) return undefined;
    return () => {
      paper.map.dispose();
      paper.rough.dispose();
    };
  }, [finish, paper]);
  const planes = section && cutaway ? sectionPlanes : undefined;
  const pile = finish === "velvet";
  const gloss = finish === "gloss";
  const soft = finish === "soft-touch";
  const surface = boardSurface(board, finish);
  return (
    <meshPhysicalMaterial
      color={color}
      map={pile ? velvet?.map : paper?.map}
      roughnessMap={pile ? velvet?.rough : paper?.rough}
      metalness={0}
      roughness={surface.roughness}
      clearcoat={gloss ? 0.75 : soft ? 0.16 : 0.06}
      clearcoatRoughness={gloss ? 0.18 : 0.48}
      sheen={pile ? 1 : soft ? 0.28 : 0.12}
      sheenColor={color}
      sheenRoughness={pile ? 0.38 : 0.55}
      envMapIntensity={surface.envMapIntensity}
      clippingPlanes={planes}
      onBeforeCompile={(shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <dithering_fragment>",
          `${WRAP_EDGE_GLOW}\n#include <dithering_fragment>`,
        );
      }}
      customProgramCacheKey={() => "wrap-edge-glow"}
    />
  );
}

/** Warm rim on the wrap. No noise texture and no triplanar lattice. */
const WRAP_EDGE_GLOW = `float wrapNd = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
gl_FragColor.rgb += vec3(0.96, 0.9, 0.78) * pow(1.0 - wrapNd, 2.4) * 0.2;`;

const JUICE_VERT = `
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vY;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vY = position.y;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const JUICE_FRAG = `
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vY;
  uniform vec3 uColor;
  uniform float uFade;
  uniform float uTop;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = max(dot(N, V), 0.0);
    float fres = pow(1.0 - ndv, 1.8);
    float meniscus = smoothstep(uTop - 3.2, uTop - 0.4, vY) * (1.0 - smoothstep(uTop - 0.2, uTop + 1.4, vY));
    vec3 deep = uColor * vec3(0.55, 0.42, 0.32);
    vec3 color = mix(deep, uColor, 0.45 + ndv * 0.55);
    color = mix(color, min(uColor * 1.35, vec3(1.0)), meniscus * 0.55);
    float alpha = mix(0.62, 0.22, fres);
    alpha = mix(alpha, 0.16, meniscus * 0.7);
    gl_FragColor = vec4(color, clamp(alpha, 0.12, 0.68) * uFade);
  }
`;

export function JuiceMaterial({ color, top }: { color: string; top: number }) {
  const uniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(color) }, uFade: { value: 1 }, uTop: { value: top } }),
    [color, top],
  );
  const ref = useRef<THREE.ShaderMaterial>(null);
  useEffect(() => {
    if (ref.current) ref.current.userData.intendedFade = 1;
  }, []);
  return (
    <shaderMaterial
      ref={ref}
      transparent
      depthWrite
      side={THREE.FrontSide}
      polygonOffset
      polygonOffsetFactor={1}
      polygonOffsetUnits={1}
      uniforms={uniforms}
      vertexShader={JUICE_VERT}
      fragmentShader={JUICE_FRAG}
    />
  );
}
