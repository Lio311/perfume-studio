import { bottleRadii } from "../model/sample.ts";
import type { SectionKind } from "../model/types.ts";

/** Same sweep inputs as the glass, plus the decal size. Kept free of three so fit math stays in the entry. */
export interface LabelPatchArgs {
  height: number;
  width: number;
  depth: number;
  section: SectionKind;
  softness: number;
  faceted: boolean;
  neckR: number;
  profile: Parameters<typeof bottleRadii>[4];
  shoulder: number;
  finishMm?: number;
  inset?: number;
  closedTop?: boolean;
  limitY?: number;
  yCenter: number;
  patchH: number;
  patchW: number;
}

export function sectionPoint(
  section: SectionKind,
  angle: number,
  rx: number,
  rz: number,
  softness: number,
  morph: number,
  y: number,
): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const ellipse: [number, number] = [c * rx, s * rz];
  let shaped = ellipse;
  if (section === "squircle" || section === "rect") {
    const n = section === "squircle" ? 3.1 + (1 - softness) * 1.6 : 4.2 + (1 - softness) * 9;
    const exp = 2 / n;
    shaped = [Math.sign(c) * Math.pow(Math.abs(c), exp) * rx, Math.sign(s) * Math.pow(Math.abs(s), exp) * rz];
  } else if (section === "diamond") {
    const denom = Math.abs(c) / Math.max(rx, 0.001) + Math.abs(s) / Math.max(rz, 0.001);
    const rad = 1 / Math.max(denom, 0.001);
    shaped = [
      Math.cos(angle) * rad * (1 - softness) + ellipse[0] * softness,
      Math.sin(angle) * rad * (1 - softness) + ellipse[1] * softness,
    ];
  } else if (section === "hex" || section === "oct") {
    const n = section === "hex" ? 6 : 8;
    const sector = (Math.PI * 2) / n;
    const local = ((angle % sector) + sector) % sector;
    const mid = sector / 2;
    const edge = Math.cos(mid) / Math.max(0.2, Math.cos(local - mid));
    const round = softness * 0.72;
    shaped = [c * rx * (edge * (1 - round) + round), s * rz * (edge * (1 - round) + round)];
  } else if (section === "pebble") {
    const nse = 1 + 0.04 * Math.sin(angle * 3 + y * 0.07) + 0.025 * Math.cos(angle * 5.2 - y * 0.05);
    shaped = [c * rx * nse, s * rz * nse];
  }
  return [shaped[0] + (ellipse[0] - shaped[0]) * morph, shaped[1] + (ellipse[1] - shaped[1]) * morph];
}

/** Widest horizontal half-chord of the patch at this angular span. The mesh uses the same Y steps. */
function widestAbsX(
  args: LabelPatchArgs,
  y0: number,
  y1: number,
  height: number,
  width: number,
  depth: number,
  neckR: number,
  span: number,
): number {
  let maxAbsX = 0;
  const steps = 28;
  for (let i = 0; i <= steps; i += 1) {
    const y = y0 + ((y1 - y0) * i) / steps;
    const sample = bottleRadii(y, height, width, depth, args.profile, args.shoulder, neckR, args.finishMm);
    for (const ang of [Math.PI / 2 - span, Math.PI / 2 + span]) {
      const [x] = sectionPoint(args.section, ang, sample.rx, sample.rz, args.softness, sample.morph, y);
      maxAbsX = Math.max(maxAbsX, Math.abs(x));
    }
  }
  return maxAbsX;
}

export function prepareLabelPatch(args: LabelPatchArgs) {
  const height = Math.max(12, args.height);
  const width = Math.max(10, args.width);
  const depth = Math.max(10, args.depth);
  const neckR = Math.max(3, args.neckR);
  const y0 = Math.max(2.5, args.yCenter - args.patchH / 2);
  const y1 = Math.min(height - 2, Math.max(y0 + 4, args.yCenter + args.patchH / 2));
  const mid = (y0 + y1) / 2;
  const midSample = bottleRadii(mid, height, width, depth, args.profile, args.shoulder, neckR, args.finishMm);
  const half = Math.min(Math.max(6, args.patchW / 2), midSample.rx * 0.86);
  let lo = 0.08;
  let hi = Math.PI * 0.46;
  for (let i = 0; i < 16; i += 1) {
    const span = (lo + hi) / 2;
    // Size the span from the widest point on the arc across all rows, so a round
    // bottle does not draw a plate wider than the width fit reported.
    const edge = widestAbsX(args, y0, y1, height, width, depth, neckR, span);
    if (edge < half) lo = span;
    else hi = span;
  }
  return { height, width, depth, neckR, y0, y1, mid, midSample, half, span: lo };
}

/** Width and height of the decal that `buildLabelPatch` will actually draw. */
export function labelPatchExtent(args: LabelPatchArgs): { width: number; height: number } {
  const prep = prepareLabelPatch(args);
  const maxAbsX = widestAbsX(args, prep.y0, prep.y1, prep.height, prep.width, prep.depth, prep.neckR, prep.span);
  return { width: maxAbsX * 2, height: prep.y1 - prep.y0 };
}
