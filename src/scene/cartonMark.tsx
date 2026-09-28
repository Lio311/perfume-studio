import * as THREE from "three";
import { logoById } from "../model/catalog.ts";
import type { LogoApplication } from "../model/types.ts";
import { cartonMarkSize, FOIL_ENV_FLOOR, labelEmissive, labelFinish, labelInk } from "../geometry/logos.ts";
import { useLab } from "../store/labStore.ts";
import { useCartonLabelCanvas, useLabelMaps } from "./labelPaint.ts";

export function LabelFinishMaterial({
  map,
  mask,
  emissiveMap,
  ink,
  application,
  overlay = false,
}: {
  map: THREE.Texture;
  mask: THREE.Texture | null;
  emissiveMap: THREE.Texture | null;
  ink: string;
  application: LogoApplication;
  overlay?: boolean;
}) {
  const finish = labelFinish(application);
  const flat = finish.metalness === 0 && finish.bumpScale === 0;
  if (flat || !mask) {
    return (
      <meshBasicMaterial
        map={map}
        toneMapped={false}
        transparent={overlay}
        depthWrite={!overlay}
        polygonOffset={!overlay}
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
    );
  }
  // Roughness is multiplied by the map. The uniform stays 1 so the plate (green = 1) stays matte
  // and the ink uses labelFinish().roughness, stored in that channel. Metalness uses the blue channel.
  // Foil keeps an environment floor and a small ink-coloured emissive so the face stays the ink colour
  // when the studio behind the camera is dark. The emissive map is black on the plate.
  const envMapIntensity = application === "foil" ? Math.max(finish.envMapIntensity, FOIL_ENV_FLOOR) : finish.envMapIntensity;
  return (
    <meshStandardMaterial
      map={map}
      metalness={finish.metalness}
      metalnessMap={mask}
      roughness={1}
      roughnessMap={mask}
      bumpMap={finish.bumpScale !== 0 ? mask : undefined}
      bumpScale={finish.bumpScale}
      envMapIntensity={envMapIntensity}
      emissive={labelEmissive(ink, application)}
      emissiveIntensity={finish.emissive}
      emissiveMap={finish.emissive > 0 ? emissiveMap ?? undefined : undefined}
      toneMapped={finish.metalness < 0.5}
      transparent={overlay}
      alphaTest={overlay ? 0.1 : 0}
      depthWrite={!overlay}
      polygonOffset={!overlay}
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
  const spec = logoById(variantId);
  const ink = labelInk(color, spec.application);
  const canvas = useCartonLabelCanvas();
  const aspect = Number(canvas.dataset.aspect);
  const { width: planeW, height: planeH } = cartonMarkSize(w, aspect);
  const { color: tex, mask, emissive } = useLabelMaps(canvas, ink, spec.application);
  if (blueprint || text.trim().length === 0) return null;
  return (
    <mesh position={[0, y, z]}>
      <planeGeometry args={[planeW, planeH]} />
      <LabelFinishMaterial map={tex} mask={mask} emissiveMap={emissive} ink={ink} application={spec.application} overlay />
    </mesh>
  );
}
