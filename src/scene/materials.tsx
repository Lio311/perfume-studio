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
      transmission={glassLike ? (clear ? 1 : finish === "frosted" ? 0.82 : 0.92) : 0}
      thickness={glassLike ? (finish === "tinted" ? 4.2 : 3.4) : 0}
      ior={clear ? 1.5 : 1.48}
      clearcoat={clear || finish === "tinted" ? 1 : metal ? 0.65 : 0.04}
      clearcoatRoughness={metal ? 0.12 : 0.04}
      attenuationColor={clear ? "#fff8ee" : color}
      attenuationDistance={clear ? 160 : finish === "tinted" ? 22 : 36}
      envMapIntensity={metal ? 2.15 : glassLike ? 2.4 : finish === "matteBlack" ? 0.28 : 0.7}
      specularIntensity={glassLike || metal ? 1 : 0.3}
      transparent={glassLike}
      side={glassLike ? THREE.FrontSide : THREE.FrontSide}
    />
  );
}
