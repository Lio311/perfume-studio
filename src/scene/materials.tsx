import { useMemo } from "react";
import * as THREE from "three";
import type { FinishId } from "../model/types.ts";
import { isGlass } from "../model/materials.ts";
import { leatherBump, woodMap } from "../geometry/textures.ts";

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
  const glassLike = glass && isGlass(finish);
  const metal = finish === "gold" || finish === "silver" || finish === "rose";
  return (
    <meshPhysicalMaterial
      color={color}
      flatShading={flat}
      map={wood ?? undefined}
      bumpMap={leather ?? undefined}
      bumpScale={leather ? 0.4 : 0}
      metalness={metal ? 1 : finish === "matteBlack" ? 0.12 : 0.02}
      roughness={
        finish === "clear" ? 0.07 :
        finish === "frosted" ? 0.42 :
        finish === "tinted" ? 0.1 :
        metal ? 0.22 :
        finish === "matteBlack" ? 0.62 :
        finish === "wood" ? 0.74 :
        0.82
      }
      transmission={glassLike ? (finish === "clear" ? 0.92 : finish === "frosted" ? 0.72 : 0.62) : 0}
      thickness={glassLike ? (finish === "tinted" ? 8 : 4.2) : 0}
      ior={1.5}
      clearcoat={finish === "clear" || finish === "tinted" ? 0.35 : metal ? 0.85 : finish === "matteBlack" ? 0.12 : 0.04}
      clearcoatRoughness={metal ? 0.32 : 0.18}
      attenuationColor={finish === "clear" ? "#efe6d8" : color}
      attenuationDistance={finish === "tinted" ? 12 : finish === "frosted" ? 18 : 26}
      envMapIntensity={metal ? 1.15 : 0.72}
      transparent={glassLike}
      side={glassLike ? THREE.DoubleSide : THREE.FrontSide}
    />
  );
}
