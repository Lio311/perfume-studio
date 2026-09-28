import { useContext, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { computeFit } from "../model/fit.ts";
import type { PartKey } from "../model/types.ts";
import { useLab, type StageMode } from "../store/labStore.ts";
import { Clock } from "./clock.ts";
import { explodeLocal } from "./explodeCurve.ts";

const GOLD = "#f3e6cc";

export interface Frame {
  home: [number, number, number];
  explode: [number, number, number];
  index: number;
  center: [number, number, number];
  size: [number, number, number];
}

export function frameFor(part: PartKey, fit: ReturnType<typeof computeFit>): Frame {
  if (part === "cap") {
    return { home: [0, fit.capBottom, 0], explode: fit.explode.cap, index: 1, center: [0, fit.capH / 2, 0], size: [fit.capW, fit.capH, fit.capD] };
  }
  if (part === "pump") {
    const w = Math.max(8, fit.actuatorR * 2.4);
    return { home: [0, fit.pumpBase, 0], explode: fit.explode.pump, index: 2, center: [0, fit.actuatorH / 2, 0], size: [w, fit.actuatorH + 4, w] };
  }
  if (part === "collar") {
    const d = fit.collarOuter * 2;
    return { home: [0, fit.collarBottom, 0], explode: fit.explode.collar, index: 3, center: [0, fit.collarHeight / 2, 0], size: [d, fit.collarHeight, d] };
  }
  if (part === "label") {
    return { home: [0, fit.labelY, fit.labelZ], explode: fit.explode.label, index: 4, center: [0, 0, 0], size: [fit.labelW, fit.labelH, 1.2] };
  }
  if (part === "box") {
    return { home: [fit.boxX, 0, fit.boxZ], explode: fit.explode.box, index: 0, center: [0, fit.boxH / 2, 0], size: [fit.boxW, fit.boxH, fit.boxD] };
  }
  return { home: [0, 0, 0], explode: [0, 0, 0], index: 5, center: [0, fit.bottleH / 2, 0], size: [fit.bottleW, fit.bottleH, fit.bottleD] };
}

/** Box mode parks the carton on the origin. Together keeps the far presentation offset. */
export function posedFrame(part: PartKey, fit: ReturnType<typeof computeFit>, stage: StageMode): Frame {
  const frame = frameFor(part, fit);
  if (stage === "box" && part === "box") return { ...frame, home: [0, 0, 0], explode: [0, 0, 0] };
  return frame;
}

/** Puts a part's base on a turntable at the origin, for the solo view. */
export function turntableHome(frame: Frame): [number, number, number] {
  return [-frame.center[0], 2 - frame.center[1] + frame.size[1] / 2, -frame.center[2]];
}

export function PartGuides() {
  const selected = useLab((s) => s.selected);
  const mode = useLab((s) => s.mode);
  const design = useLab((s) => s.design);
  const explodeAmt = useLab((s) => s.explode);
  const stage = useLab((s) => s.stage);
  const blueprint = useLab((s) => s.blueprint);
  const solo = useLab((s) => s.solo);
  const hero: PartKey = stage === "box" ? "box" : "bottle";
  const picked = selected && (stage === "box" ? selected === "box" : stage === "bottle" ? selected !== "box" : true) ? selected : null;
  const part = solo ?? picked ?? (blueprint ? hero : null);
  if (!part || mode === "compare" || !design[part].visible) return null;
  if (!solo && stage === "bottle" && part === "box") return null;
  if (!solo && stage === "box" && part !== "box") return null;
  const fit = computeFit(design, explodeAmt > 0.45);
  const frame = posedFrame(part, fit, stage);
  const posed = solo ? { ...frame, home: turntableHome(frame), explode: [0, 0, 0] as [number, number, number] } : frame;
  return <GuideFrame frame={posed} dims={Boolean(solo) || mode === "dimensions" || mode === "explode" || blueprint} />;
}

function GuideFrame({ frame, dims }: { frame: Frame; dims: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const clock = useContext(Clock);
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const local = explodeLocal(frame.index, clock.current);
    group.position.set(
      frame.home[0] + frame.explode[0] * local,
      frame.home[1] + frame.explode[1] * local,
      frame.home[2] + frame.explode[2] * local,
    );
  });
  const [w, h, d] = frame.size;
  return (
    <group ref={ref} position={frame.home}>
      <group position={frame.center}>
        <Brackets w={w} h={h} d={d} />
        {dims && <Dimensions w={w} h={h} d={d} />}
      </group>
    </group>
  );
}

function Brackets({ w, h, d }: { w: number; h: number; d: number }) {
  const pad = 3.5;
  const x = w / 2 + pad;
  const y = h / 2 + pad;
  const z = d / 2 + pad;
  const arm = Math.max(3.4, Math.min(9, w, h) * 0.2);
  const corners: Array<[number, number, number]> = [
    [-x, -y, -z], [x, -y, -z], [-x, y, -z], [x, y, -z],
    [-x, -y, z], [x, -y, z], [-x, y, z], [x, y, z],
  ];
  return (
    <>
      {corners.map(([cx, cy, cz]) => {
        const sx = cx < 0 ? 1 : -1;
        const sy = cy < 0 ? 1 : -1;
        const sz = cz < 0 ? 1 : -1;
        const origin: [number, number, number] = [cx, cy, cz];
        return (
          <group key={`${cx}${cy}${cz}`}>
            <Line points={[origin, [cx + sx * arm, cy, cz]]} color={GOLD} lineWidth={1} />
            <Line points={[origin, [cx, cy + sy * arm, cz]]} color={GOLD} lineWidth={1} />
            <Line points={[origin, [cx, cy, cz + sz * arm]]} color={GOLD} lineWidth={1} />
          </group>
        );
      })}
    </>
  );
}

function Dimensions({ w, h, d }: { w: number; h: number; d: number }) {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const gap = 14;
  return (
    <>
      <Line points={[[-x, -y - gap, z + 2], [x, -y - gap, z + 2]]} color={GOLD} lineWidth={1} />
      <Line points={[[x + gap, -y, z], [x + gap, y, z]]} color={GOLD} lineWidth={1} />
      <Line points={[[-x - gap, -y, -z], [-x - gap, -y, z]]} color={GOLD} lineWidth={1} />
    </>
  );
}
