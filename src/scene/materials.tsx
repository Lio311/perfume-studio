import { useMemo } from "react";
import * as THREE from "three";
import type { FinishId } from "../model/types.ts";
import { isGlass } from "../model/materials.ts";
import { leatherBump, woodMap } from "../geometry/textures.ts";

function mattePaper(hex: string): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bumpCtx = bumpCanvas.getContext("2d");
  const lifted = new THREE.Color(hex).lerp(new THREE.Color("#7a756c"), 0.55);
  if (ctx && bumpCtx) {
    ctx.fillStyle = `#${lifted.getHexString()}`;
    ctx.fillRect(0, 0, 256, 256);
    bumpCtx.fillStyle = "#808080";
    bumpCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2200; i += 1) {
      const n = 70 + Math.random() * 140;
      ctx.fillStyle = `rgba(${n | 0},${Math.max(0, n - 8) | 0},${Math.max(0, n - 16) | 0},0.35)`;
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const w = 1 + Math.random() * 2.6;
      ctx.fillRect(x, y, w, 1);
      bumpCtx.fillStyle = `rgb(${70 + Math.random() * 120},${70 + Math.random() * 120},${70 + Math.random() * 120})`;
      bumpCtx.fillRect(x, y, w, 1);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  const bump = new THREE.CanvasTexture(bumpCanvas);
  for (const texture of [map, bump]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.2, 2.2);
  }
  map.colorSpace = THREE.SRGBColorSpace;
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
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.15);
    vec3 L = normalize(vec3(0.35, 0.82, 0.55));
    vec3 R = reflect(-L, N);
    float spec = pow(max(dot(R, V), 0.0), 56.0);
    vec3 rimLight = normalize(vec3(-0.7, 0.35, -0.4));
    float rim = pow(1.0 - max(dot(N, normalize(V + rimLight)), 0.0), 2.4);
    vec3 glass = vec3(0.96, 0.94, 0.90);
    vec3 gold = vec3(1.0, 0.86, 0.58);
    vec3 color = mix(glass, gold, fres * 0.45) + gold * rim * 0.35 + vec3(1.0, 0.97, 0.9) * spec;
    float alpha = 0.045 + fres * 0.62 + spec * 0.35;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.92));
  }
`;

function ClearGlass() {
  return (
    <shaderMaterial
      transparent
      depthWrite={false}
      vertexShader={CLEAR_VERT}
      fragmentShader={CLEAR_FRAG}
    />
  );
}

export function FinishMaterial({
  finish,
  color,
  flat = false,
  glass = false,
}: {
  finish: FinishId;
  color: string;
  flat?: boolean;
  glass?: boolean;
}) {
  const wood = useMemo(() => (finish === "wood" ? woodMap() : null), [finish]);
  const leather = useMemo(() => (finish === "leather" ? leatherBump() : null), [finish]);
  const paper = useMemo(() => (finish === "matteBlack" ? mattePaper(color) : null), [finish, color]);
  const glassLike = glass && isGlass(finish);
  const metal = finish === "gold" || finish === "silver" || finish === "rose";
  const clear = finish === "clear";
  if (clear && glass) return <ClearGlass />;
  return (
    <meshPhysicalMaterial
      color={paper ? "#ffffff" : color}
      flatShading={flat}
      map={wood ?? paper?.map ?? undefined}
      bumpMap={leather ?? paper?.bump ?? undefined}
      bumpScale={leather ? 0.35 : paper ? 0.35 : 0}
      emissive={paper ? "#3a342c" : "#000000"}
      emissiveIntensity={paper ? 0.18 : 0}
      metalness={metal ? 1 : finish === "matteBlack" ? 0.02 : 0}
      roughness={
        clear ? 0.015 :
        finish === "frosted" ? 0.34 :
        finish === "tinted" ? 0.05 :
        metal ? 0.14 :
        finish === "matteBlack" ? 0.86 :
        finish === "wood" ? 0.7 :
        0.84
      }
      transmission={glassLike ? (clear ? 0.15 : finish === "frosted" ? 0.35 : 0.55) : 0}
      thickness={glassLike ? (finish === "tinted" ? 4.2 : 2.8) : 0}
      ior={clear ? 1.52 : 1.5}
      clearcoat={clear || finish === "tinted" ? 1 : metal ? 0.65 : 0.04}
      clearcoatRoughness={metal ? 0.12 : 0.04}
      attenuationColor={clear ? "#fff8ee" : color}
      attenuationDistance={clear ? 160 : finish === "tinted" ? 22 : 36}
      envMapIntensity={metal ? 1.65 : glassLike ? 1.7 : finish === "matteBlack" ? 0.28 : 0.7}
      specularIntensity={glassLike || metal ? 1 : 0.3}
      transparent
      opacity={glassLike ? (clear ? 0.14 : finish === "frosted" ? 0.45 : 0.32) : 1}
      depthWrite={!glassLike}
      side={THREE.FrontSide}
    />
  );
}
