import * as THREE from "three";
import { resolvedLabelApplication } from "../model/catalog.ts";
import type { LogoApplication } from "../model/types.ts";
import { cartonMarkSize, contrastRatio, FOIL_CONTRAST_FLOOR, FOIL_ENV_FLOOR, FOIL_LOW_METALNESS, labelEmissive, labelFinish, labelInk } from "../geometry/logos.ts";
import { useLab } from "../store/labStore.ts";
import { useCartonLabelCanvas, useLabelMaps } from "./labelPaint.ts";
import { boardSurface } from "./materials.tsx";

export function LabelFinishMaterial({
  map,
  mask,
  emissiveMap,
  normalMap = null,
  ink,
  application,
  overlay = false,
  substrate,
  surface,
}: {
  map: THREE.Texture;
  mask: THREE.Texture | null;
  emissiveMap: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  ink: string;
  application: LogoApplication;
  overlay?: boolean;
  /** Plate behind a foil mark. Used only when the tint would disappear into it. */
  substrate?: string;
  /** Carton emboss matches the board instead of the label-plate finish. */
  surface?: { roughness: number; envMapIntensity: number };
}) {
  const finish = labelFinish(application);
  const flat = finish.metalness === 0 && finish.bumpScale === 0 && !normalMap;
  const open = overlay || application !== "decal";
  const lowFoil = application === "foil" && !!substrate && contrastRatio(ink, substrate) < FOIL_CONTRAST_FLOOR;
  const embossBoard = application === "emboss" && surface;
  // Engrave is baked frost and stays unlit. Emboss uses the normal map so it is lit, on the bottle and the carton.
  const baked = application === "engrave";
  if (baked || flat || !mask) {
    return (
      <meshBasicMaterial
        map={map}
        toneMapped={false}
        transparent={open}
        alphaTest={overlay ? 0.35 : 0}
        depthWrite={!open}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
    );
  }
  // Roughness is multiplied by the map. The uniform stays 1 so the plate (green = 1) stays matte
  // and the ink uses labelFinish().roughness, stored in that channel. Metalness uses the blue channel.
  // Carton emboss skips that map and uses the board's roughness and environment instead.
  // Foil keeps an environment floor and a small ink-coloured emissive so a coloured tint stays itself
  // when the studio behind the camera is dark. A lifted black tint skips that glow. Its uniform is
  // 0.13 divided by the mapped roughness, so the ink lands near 0.13 and the face stays glossy black.
  const envMapIntensity = application === "foil"
    ? (lowFoil ? 0.55 : Math.max(finish.envMapIntensity, FOIL_ENV_FLOOR))
    : embossBoard
      ? surface.envMapIntensity
      : finish.envMapIntensity;
  const metalness = lowFoil ? FOIL_LOW_METALNESS : finish.metalness;
  // A lifted black tint plus ink-coloured emissive reads as silver. The rim on the map is enough.
  const emissiveIntensity = lowFoil ? 0 : finish.emissive;
  return (
    <meshStandardMaterial
      map={map}
      metalness={metalness}
      metalnessMap={mask}
      roughness={lowFoil ? 0.13 / finish.roughness : embossBoard ? surface.roughness : 1}
      roughnessMap={embossBoard ? undefined : mask}
      bumpMap={finish.bumpScale !== 0 && !normalMap ? mask : undefined}
      bumpScale={finish.bumpScale}
      normalMap={normalMap ?? undefined}
      normalScale={normalMap ? [2.4, 2.4] : undefined}
      envMapIntensity={envMapIntensity}
      emissive={lowFoil ? "#000000" : labelEmissive(ink, application)}
      emissiveIntensity={emissiveIntensity}
      emissiveMap={emissiveIntensity > 0 ? emissiveMap ?? undefined : undefined}
      toneMapped={metalness < 0.5}
      transparent={open}
      alphaTest={overlay ? 0.35 : 0}
      depthWrite={!open}
      premultipliedAlpha={!open}
      polygonOffset
      polygonOffsetFactor={-4}
      polygonOffsetUnits={-4}
    />
  );
}

/** Brand line on a carton face. Print keeps a contrasting plate; foil, emboss, and engrave do not. */
export function CartonMark({ w, y, z }: { w: number; y: number; z: number }) {
  const blueprint = useLab((s) => s.blueprint);
  const variantId = useLab((s) => s.design.label.variantId);
  const color = useLab((s) => s.design.label.color);
  const text = useLab((s) => s.design.label.text);
  const stored = useLab((s) => s.design.label.application);
  const boxColor = useLab((s) => s.design.box.color);
  const board = useLab((s) => s.design.box.material);
  const wrapFinish = useLab((s) => s.design.box.wrap?.finish ?? "soft-touch");
  const application = resolvedLabelApplication({ variantId, application: stored });
  const ground = application === "emboss" || application === "engrave" ? boxColor : undefined;
  const ink = labelInk(color, application, ground);
  const surface = application === "emboss" ? boardSurface(board || "rigid", wrapFinish) : undefined;
  const canvas = useCartonLabelCanvas();
  const aspect = Number(canvas.dataset.aspect);
  const { width: planeW, height: planeH } = cartonMarkSize(w, aspect);
  const { color: tex, mask, emissive, normal } = useLabelMaps(canvas, ink, application);
  if (blueprint || text.trim().length === 0) return null;
  return (
    <mesh position={[0, y, z]}>
      <planeGeometry args={[planeW, planeH]} />
      <LabelFinishMaterial
        map={tex}
        mask={mask}
        emissiveMap={emissive}
        normalMap={normal}
        ink={ink}
        application={application}
        overlay
        substrate={application === "foil" ? boxColor : undefined}
        surface={surface}
      />
    </mesh>
  );
}
