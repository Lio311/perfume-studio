import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { cartonMarkSize, labelInk } from "../../geometry/logos.ts";
import { logoById } from "../../model/catalog.ts";
import { useLab } from "../../store/labStore.ts";
import { BOX_CLOSED_MARK_AZIMUTH } from "../boxCamera.ts";
import { LabelFinishMaterial } from "../cartonMark.tsx";
import { useCartonLabelCanvas, useLabelMaps } from "../labelPaint.ts";
import { MARK_FACE_GAP } from "./kit.tsx";

/** Hard cap so the brand band stays on the camera-facing side of the cylinder. */
export const TUBE_MARK_ANGLE_CAP = (50 * Math.PI) / 180;

/**
 * Curved brand band. The arc matches the painted line, centred on the closed shot.
 * The 0.92 inset in cartonMarkSize leaves a margin inside the angle cap.
 */
export function tubeMarkBand(radius: number, aspect = 3): {
  radius: number;
  angle: number;
  arc: number;
  thetaStart: number;
  height: number;
} {
  const surface = Math.max(1, radius) + MARK_FACE_GAP;
  const sized = cartonMarkSize(surface * TUBE_MARK_ANGLE_CAP, aspect);
  let angle = sized.width / surface;
  let height = sized.height;
  if (angle > TUBE_MARK_ANGLE_CAP) {
    angle = TUBE_MARK_ANGLE_CAP;
    const safe = Number.isFinite(aspect) && aspect > 0.15 ? aspect : 3;
    height = (surface * angle) / safe;
  }
  return {
    radius: surface,
    angle,
    arc: surface * angle,
    thetaStart: BOX_CLOSED_MARK_AZIMUTH - angle / 2,
    height,
  };
}

/** Brand line wrapped on a cylinder, facing the closed shot camera. */
export function TubeMark({ radius, y }: { radius: number; y: number }) {
  const blueprint = useLab((s) => s.blueprint);
  const variantId = useLab((s) => s.design.label.variantId);
  const color = useLab((s) => s.design.label.color);
  const text = useLab((s) => s.design.label.text);
  const spec = logoById(variantId);
  const ink = labelInk(color, spec.application);
  const canvas = useCartonLabelCanvas();
  const aspect = Number(canvas.dataset.aspect);
  const band = tubeMarkBand(radius, Number.isFinite(aspect) && aspect > 0 ? aspect : 3);
  const geo = useMemo(
    () => new THREE.CylinderGeometry(band.radius, band.radius, Math.max(band.height, 1), 48, 1, true, band.thetaStart, band.angle),
    [band.radius, band.angle, band.thetaStart, band.height],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  const { color: tex, mask, emissive } = useLabelMaps(canvas, ink, spec.application);
  if (blueprint || text.trim().length === 0) return null;
  return (
    <mesh geometry={geo} position={[0, y, 0]}>
      <LabelFinishMaterial map={tex} mask={mask} emissiveMap={emissive} ink={ink} application={spec.application} overlay />
    </mesh>
  );
}
