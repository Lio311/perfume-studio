import { useContext, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { computeFit } from "../model/fit.ts";
import type { PartKey } from "../model/types.ts";
import { useLab, type StageMode } from "../store/labStore.ts";
import { Clock } from "./clock.ts";
import { explodeLocal } from "./explodeCurve.ts";

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
    return { home: [0, fit.labelY, fit.labelZ], explode: fit.explode.label, index: 4, center: [0, 0, 0], size: [fit.labelW, fit.labelH, 8] };
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

function useGuideColor() {
  const theme = useLab((s) => s.theme);
  return theme === "light" ? "#9a7b4a" : "#f3e6cc";
}

export function PartGuides() {
  const selected = useLab((s) => s.selected);
  const mode = useLab((s) => s.mode);
  const design = useLab((s) => s.design);
  const explodeAmt = useLab((s) => s.explode);
  const stage = useLab((s) => s.stage);
  const blueprint = useLab((s) => s.blueprint);
  const solo = useLab((s) => s.solo);
  const units = useLab((s) => s.units);
  const hero: PartKey = stage === "box" ? "box" : "bottle";
  const picked = selected && (stage === "box" ? selected === "box" : stage === "bottle" ? selected !== "box" : true) ? selected : null;
  const part = solo ?? picked ?? (blueprint || mode === "dimensions" ? hero : null);
  if (!part || mode === "compare" || !design[part].visible) return null;
  if (!solo && stage === "bottle" && part === "box") return null;
  if (!solo && stage === "box" && part !== "box") return null;
  const fit = computeFit(design, explodeAmt > 0.45);
  const frame = posedFrame(part, fit, stage);
  const posed = solo ? { ...frame, home: turntableHome(frame), explode: [0, 0, 0] as [number, number, number] } : frame;
  const neck = part === "bottle" ? fit.neckR * 2 : 0;
  return <GuideFrame frame={posed} dims={Boolean(solo) || mode === "dimensions" || mode === "explode" || blueprint} neck={neck} unit={units} />;
}

function GuideFrame({ frame, dims, neck, unit }: { frame: Frame; dims: boolean; neck: number; unit: "mm" | "cm" | "in" }) {
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
        {dims && <Dimensions w={w} h={h} d={d} neck={neck} unit={unit} />}
      </group>
    </group>
  );
}

function Brackets({ w, h, d }: { w: number; h: number; d: number }) {
  const pad = 3.5;
  const color = useGuideColor();
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
            <Line points={[origin, [cx + sx * arm, cy, cz]]} color={color} lineWidth={1} />
            <Line points={[origin, [cx, cy + sy * arm, cz]]} color={color} lineWidth={1} />
            <Line points={[origin, [cx, cy, cz + sz * arm]]} color={color} lineWidth={1} />
          </group>
        );
      })}
    </>
  );
}

function formatLen(mm: number, unit: "mm" | "cm" | "in"): string {
  if (unit === "cm") return `${(mm / 10).toFixed(1)} cm`;
  if (unit === "in") return `${(mm / 25.4).toFixed(2)} in`;
  return `${mm.toFixed(1)} mm`;
}

function DimLabel({ position, text }: { position: [number, number, number]; text: string }) {
  return (
    <Html position={position} center distanceFactor={280} zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
      <span className="dim-readout">{text}</span>
    </Html>
  );
}

function Dimensions({ w, h, d, neck, unit }: { w: number; h: number; d: number; neck: number; unit: "mm" | "cm" | "in" }) {
  const color = useGuideColor();
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const gap = 14;
  return (
    <>
      <Line points={[[-x, -y - gap, z + 2], [x, -y - gap, z + 2]]} color={color} lineWidth={1} />
      <Line points={[[-x, -y - gap, z + 2], [-x, -y - 4, z + 2]]} color={color} lineWidth={1} />
      <Line points={[[x, -y - gap, z + 2], [x, -y - 4, z + 2]]} color={color} lineWidth={1} />
      <DimLabel position={[0, -y - gap - 6, z + 2]} text={formatLen(w, unit)} />
      <Line points={[[x + gap, -y, z], [x + gap, y, z]]} color={color} lineWidth={1} />
      <Line points={[[x + 4, -y, z], [x + gap, -y, z]]} color={color} lineWidth={1} />
      <Line points={[[x + 4, y, z], [x + gap, y, z]]} color={color} lineWidth={1} />
      <DimLabel position={[x + gap + 8, 0, z]} text={formatLen(h, unit)} />
      <Line points={[[-x - gap, -y, -z], [-x - gap, -y, z]]} color={color} lineWidth={1} />
      <DimLabel position={[-x - gap, -y, 0]} text={formatLen(d, unit)} />
      {neck > 1 && (
        <>
          <Line points={[[-neck / 2, y + 6, 0], [neck / 2, y + 6, 0]]} color={color} lineWidth={1} />
          <DimLabel position={[0, y + 12, 0]} text={`Ø ${formatLen(neck, unit)}`} />
        </>
      )}
    </>
  );
}
