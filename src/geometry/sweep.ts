import * as THREE from "three";
import { bottleRadii, clamp, sampleProfile } from "../model/sample.ts";
import { capProfiles } from "../model/profiles.ts";
import type { CapProfileName, SectionKind } from "../model/types.ts";
import { prepareLabelPatch, sectionPoint, type LabelPatchArgs } from "./labelPatch.ts";

export interface SweepArgs {
  height: number;
  width: number;
  depth: number;
  section: SectionKind;
  softness: number;
  faceted: boolean;
  neckR: number;
  profile: Parameters<typeof bottleRadii>[4];
  shoulder: number;
  /** Straight finish under the lip. Omit to keep the short classic neck. */
  finishMm?: number;
  inset?: number;
  closedTop?: boolean;
  /** Stop the sweep here, still using `height` for the profile. Keeps liquid inside the glass. */
  limitY?: number;
}

function orientOutward(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.computeVertexNormals();
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  let best = 0;
  let bestR = -1;
  for (let i = 0; i < pos.count; i++) {
    const r = pos.getX(i) ** 2 + pos.getZ(i) ** 2;
    if (r > bestR) {
      bestR = r;
      best = i;
    }
  }
  const dot = nor.getX(best) * pos.getX(best) + nor.getZ(best) * pos.getZ(best);
  if (dot < 0) {
    for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
    const index = geo.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i);
        const c = index.getX(i + 2);
        index.setX(i, c);
        index.setX(i + 2, a);
      }
    }
  }
  geo.computeBoundingSphere();
  return geo;
}

export function buildBottleGeometry(args: SweepArgs): THREE.BufferGeometry {
  const height = Math.max(12, args.height);
  const width = Math.max(10, args.width - (args.inset ?? 0) * 2);
  const depth = Math.max(10, args.depth - (args.inset ?? 0) * 2);
  const neckR = Math.max(3, args.neckR - (args.inset ?? 0) * 0.35);
  const ySteps = args.faceted ? 36 : 80;
  const aSteps = args.faceted ? 48 : 128;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const ringAt = (y: number, rxOverride?: number, rzOverride?: number, morphOverride?: number) => {
    const start = positions.length / 3;
    const sample = bottleRadii(clamp(y, 0, height), height, width, depth, args.profile, args.shoulder, neckR, args.finishMm);
    const rx = rxOverride ?? sample.rx;
    const rz = rzOverride ?? sample.rz;
    const morph = morphOverride ?? sample.morph;
    for (let a = 0; a <= aSteps; a++) {
      const ang = (a / aSteps) * Math.PI * 2;
      const [x, z] = sectionPoint(args.section, ang, rx, rz, args.softness, morph, y);
      positions.push(x, y, z);
      uvs.push(a / aSteps, height === 0 ? 0 : y / height);
    }
    return start;
  };

  const connect = (a0: number, b0: number) => {
    for (let a = 0; a < aSteps; a++) {
      const i0 = a0 + a;
      const i1 = i0 + 1;
      const i2 = b0 + a;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  };

  const topY = Math.min(height, Math.max(1.2, args.limitY ?? height));
  const floor = args.inset && args.inset > 0 ? Math.min(topY * 0.12, Math.max(3.2, args.inset * 1.5)) : 0;
  const ringInset = (y: number) => {
    if (!args.inset || y > floor + 4) return ringAt(y);
    const sample = bottleRadii(clamp(y, 0, height), height, width, depth, args.profile, args.shoulder, neckR, args.finishMm);
    const tuck = 0.9;
    return ringAt(y, sample.rx * tuck, sample.rz * tuck, sample.morph);
  };
  let prev = ringInset(floor);
  for (let i = 1; i <= ySteps; i++) {
    const y = floor + ((i / ySteps) * (topY - floor));
    const ring = ringInset(y);
    connect(prev, ring);
    prev = ring;
  }

  const bottomCenter = positions.length / 3;
  positions.push(0, floor + 0.35, 0);
  uvs.push(0.5, 0);
  const first = 0;
  for (let a = 0; a < aSteps; a++) indices.push(bottomCenter, first + a, first + a + 1);

  if (args.closedTop) {
    const cap = bottleRadii(clamp(topY, 0, height), height, width, depth, args.profile, args.shoulder, neckR, args.finishMm);
    const dome = Math.min(2.6, Math.max(1.2, topY * 0.055));
    const rings = 8;
    let ring = prev;
    for (let s = 1; s <= rings; s += 1) {
      const t = s / rings;
      const shrink = Math.cos(t * Math.PI * 0.5) * 0.9 + 0.08;
      const y = topY + dome * (1 - Math.cos(t * Math.PI * 0.5));
      const next = ringAt(y, Math.max(0.6, cap.rx * shrink), Math.max(0.6, cap.rz * shrink), cap.morph);
      connect(ring, next);
      ring = next;
    }
    const topCenter = positions.length / 3;
    positions.push(0, topY + dome, 0);
    uvs.push(0.5, 1);
    for (let a = 0; a < aSteps; a++) indices.push(topCenter, ring + a + 1, ring + a);
  } else {
    const lip = Math.max(1, Math.min(1.6, neckR * 0.22));
    const innerR = Math.max(2.4, neckR - lip);
    const innerTop = ringAt(height, innerR, innerR, 1);
    const innerDrop = ringAt(height - 1.5, innerR, innerR, 1);
    connect(prev, innerTop);
    connect(innerTop, innerDrop);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return orientOutward(geo);
}

/** Pull the cap silhouette in at the lip and just above the crimp so the edges read as a chamfer. */
function capBevel(t: number): number {
  const inset = 0.07;
  if (t > 0.94) {
    const u = (1 - t) / 0.06;
    const s = u * u * (3 - 2 * u);
    return 1 - inset * (1 - s);
  }
  if (t > 0.08 && t < 0.15) {
    const u = (t - 0.08) / 0.07;
    const s = u * u * (3 - 2 * u);
    return 1 - inset * 0.5 * (1 - s);
  }
  return 1;
}

export function buildCapGeometry(
  profile: CapProfileName,
  section: SectionKind,
  height: number,
  width: number,
  depth: number,
  softness: number,
  faceted: boolean,
  seatR: number,
): THREE.BufferGeometry {
  const h = Math.max(8, height);
  const aSteps = faceted ? 48 : 128;
  const ySteps = faceted ? 36 : 64;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const halfW = width / 2;
  const halfD = depth / 2;

  const ringAt = (t: number) => {
    const start = positions.length / 3;
    const y = t * h;
    let rx = Math.max(0.8, halfW * sampleProfile(capProfiles[profile], t));
    let rz = Math.max(0.8, halfD * sampleProfile(capProfiles[profile], t));
    if (t < 0.07 && seatR > 0) {
      rx = Math.max(rx, seatR);
      rz = Math.max(rz, seatR);
    }
    const bevel = capBevel(t);
    rx *= bevel;
    rz *= bevel;
    for (let a = 0; a <= aSteps; a++) {
      const ang = (a / aSteps) * Math.PI * 2;
      const [x, z] = sectionPoint(section, ang, rx, rz, softness, 0, y);
      positions.push(x, y, z);
      uvs.push(a / aSteps, t);
    }
    return start;
  };

  const connect = (a0: number, b0: number) => {
    for (let a = 0; a < aSteps; a++) {
      indices.push(a0 + a, b0 + a, a0 + a + 1, a0 + a + 1, b0 + a, b0 + a + 1);
    }
  };

  let prev = ringAt(0);
  for (let i = 1; i <= ySteps; i++) {
    const ring = ringAt(i / ySteps);
    connect(prev, ring);
    prev = ring;
  }
  const bottom = positions.length / 3;
  positions.push(0, 0, 0);
  uvs.push(0.5, 0);
  for (let a = 0; a < aSteps; a++) indices.push(bottom, a, a + 1);
  const top = positions.length / 3;
  positions.push(0, h, 0);
  uvs.push(0.5, 1);
  for (let a = 0; a < aSteps; a++) indices.push(top, prev + a + 1, prev + a);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return orientOutward(geo);
}

/** A decal on the +Z face of the same sweep the glass uses, in label-local space. */
export function buildLabelPatch(args: LabelPatchArgs): THREE.BufferGeometry {
  const { height, width, depth, neckR, y0, y1, mid, midSample, span } = prepareLabelPatch(args);
  const anchor = bottleRadii(args.yCenter, height, width, depth, args.profile, args.shoulder, neckR, args.finishMm);
  const ySteps = 28;
  const aSteps = 64;
  
  const arcLengths = [0];
  let totalArc = 0;
  let [prevX, prevZ] = sectionPoint(args.section, Math.PI / 2 - span, midSample.rx, midSample.rz, args.softness, midSample.morph, mid);
  for (let ai = 1; ai <= aSteps; ai += 1) {
    const ang = Math.PI / 2 - span + ((ai / aSteps) * span * 2);
    const [x, z] = sectionPoint(args.section, ang, midSample.rx, midSample.rz, args.softness, midSample.morph, mid);
    const dist = Math.sqrt((x - prevX) ** 2 + (z - prevZ) ** 2);
    totalArc += dist;
    arcLengths.push(totalArc);
    prevX = x;
    prevZ = z;
  }
  
  const yArcLengths = [0];
  let totalYArc = 0;
  let prevMidSample = bottleRadii(y0, height, width, depth, args.profile, args.shoulder, neckR, args.finishMm);
  let [prevMidX, prevMidZ] = sectionPoint(args.section, Math.PI / 2, prevMidSample.rx, prevMidSample.rz, args.softness, prevMidSample.morph, y0);
  let prevY = y0;
  for (let yi = 1; yi <= ySteps; yi += 1) {
    const y = y0 + ((y1 - y0) * yi) / ySteps;
    const sample = bottleRadii(y, height, width, depth, args.profile, args.shoulder, neckR, args.finishMm);
    const [mx, mz] = sectionPoint(args.section, Math.PI / 2, sample.rx, sample.rz, args.softness, sample.morph, y);
    const dist = Math.sqrt((mx - prevMidX) ** 2 + (mz - prevMidZ) ** 2 + (y - prevY) ** 2);
    totalYArc += dist;
    yArcLengths.push(totalYArc);
    prevMidX = mx;
    prevMidZ = mz;
    prevY = y;
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let yi = 0; yi <= ySteps; yi += 1) {
    const y = y0 + ((y1 - y0) * yi) / ySteps;
    const sample = bottleRadii(y, height, width, depth, args.profile, args.shoulder, neckR, args.finishMm);
    for (let ai = 0; ai <= aSteps; ai += 1) {
      const ang = Math.PI / 2 - span + ((ai / aSteps) * span * 2);
      const [x, z] = sectionPoint(args.section, ang, sample.rx, sample.rz, args.softness, sample.morph, y);
      positions.push(x, y - args.yCenter, z - anchor.rz);
      // u = 0 is the left of the canvas. On the +Z face that is negative X, so the word is not mirrored.
      uvs.push(1 - arcLengths[ai] / totalArc, yArcLengths[yi] / Math.max(totalYArc, 0.001));
    }
  }
  const stride = aSteps + 1;
  for (let yi = 0; yi < ySteps; yi += 1) {
    for (let ai = 0; ai < aSteps; ai += 1) {
      const i0 = yi * stride + ai;
      indices.push(i0, i0 + stride, i0 + 1, i0 + 1, i0 + stride, i0 + stride + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function curvedPlate(width: number, height: number, radius: number): THREE.BufferGeometry {
  const segs = 28;
  const theta = Math.min(1.15, 2 * Math.asin(clamp(width / (2 * Math.max(radius, 1)), -1, 1)));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= 1; y++) {
    for (let i = 0; i <= segs; i++) {
      const a = -theta / 2 + (i / segs) * theta;
      positions.push(Math.sin(a) * radius, (y - 0.5) * height, Math.cos(a) * radius);
      uvs.push(i / segs, y);
    }
  }
  const stride = segs + 1;
  for (let y = 0; y < 1; y++) {
    for (let i = 0; i < segs; i++) {
      const a = y * stride + i;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.translate(0, 0, -radius);
  geo.computeVertexNormals();
  return geo;
}
