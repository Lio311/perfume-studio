import { useContext, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { partLabel } from "../i18n/copy.ts";
import { computeFit } from "../model/fit.ts";
import type { Design, PartKey } from "../model/types.ts";
import { useLab } from "../store/labStore.ts";
import { clickPart } from "./focusClick.ts";
import { Clock } from "./clock.ts";
import { sceneSpan } from "./limits.ts";
import { explodeLocal } from "./explodeCurve.ts";
import { posedFrame, turntableHome } from "./Guides.tsx";

const SIDES: Record<PartKey, -1 | 1> = {
  cap: -1,
  collar: -1,
  label: -1,
  liquid: -1,
  pump: 1,
  bottle: 1,
  box: 1,
};

const ORDER: Record<PartKey, number> = {
  cap: 0,
  pump: 0,
  collar: 1,
  bottle: 1,
  label: 2,
  box: 2,
  liquid: 3,
};

const NAME_PARTS: PartKey[] = ["cap", "collar", "label", "liquid", "pump", "bottle", "box"];


function partSize(part: PartKey, design: Design, fit: ReturnType<typeof computeFit>): string {
  if (part === "bottle") return `${design.bottle.widthMm.toFixed(1)}×${design.bottle.depthMm.toFixed(1)}×${design.bottle.heightMm.toFixed(1)}`;
  if (part === "cap") return `${fit.capW.toFixed(1)}×${fit.capH.toFixed(1)}`;
  if (part === "collar") return `Ø${(fit.collarOuter * 2).toFixed(1)}`;
  if (part === "pump") return `Ø${(fit.actuatorR * 2).toFixed(1)}`;
  if (part === "label") return design.label.text;
  if (part === "box") return `${fit.boxW.toFixed(0)}×${fit.boxH.toFixed(0)}`;
  return "";
}

interface Slot {
  key: string;
  side: -1 | 1;
  order: number;
  title: string;
  detail: string;
  selected: boolean;
  dim: boolean;
  anchor: THREE.Vector3;
}

export function Callouts() {
  const layer = useRef<HTMLDivElement | null>(null);
  const clock = useContext(Clock);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const anchor = useRef(new THREE.Vector3());
  const camRight = useRef(new THREE.Vector3());

  useLayoutEffect(() => {
    const slot = document.querySelector(".stage-slot");
    if (!slot) return;
    const el = document.createElement("div");
    el.className = "callout-layer";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "callout-svg");
    el.appendChild(svg);
    slot.appendChild(el);
    layer.current = el;
    return () => {
      el.remove();
      layer.current = null;
    };
  }, []);

  useFrame(() => {
    const root = layer.current;
    if (!root) return;
    const slot = root.parentElement;
    if (!slot) return;
    const state = useLab.getState();
    const svg = root.querySelector("svg");
    if (!svg) return;
    if (state.mode === "compare" || state.present || state.aimed || state.explode >= 0.5 || sceneSpan.flying) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    const fit = computeFit(state.design, state.explode > 0.45);
    const showNames = state.explode > 0.08 || state.blueprint;
    const showDims = state.mode === "dimensions" || state.mode === "explode" || state.blueprint;
    const items: Slot[] = [];

    for (const part of NAME_PARTS) {
      if (state.solo && part !== state.solo) continue;
      if (state.stage === "bottle" && part === "box") continue;
      if (state.stage === "box" && part !== "box") continue;
      if (state.stage === "together" && part === "box" && !state.design.box.visible) continue;
      if (!showNames || !state.design[part].visible) continue;
      if (part === "liquid" && !state.design.bottle.visible) continue;
      if (state.stage === "box" && part === "box") {
        /* carton is the product; visibility is forced by the stage */
      } else if (state.stage !== "bottle" && part !== "box" && state.stage === "box") continue;
      const frame = posedFrame(part, fit, state.stage);
      const parked = state.solo === part;
      const local = parked ? 0 : explodeLocal(frame.index, clock.current);
      const home = parked ? turntableHome(frame) : frame.home;
      const burst = parked ? [0, 0, 0] : frame.explode;
      anchor.current.set(
        home[0] + burst[0] * local + frame.center[0],
        home[1] + burst[1] * local + frame.center[1],
        home[2] + burst[2] * local + frame.center[2],
      );
      if (part === "liquid" && !parked) anchor.current.y *= 0.62;
      camRight.current.setFromMatrixColumn(camera.matrixWorld, 0);
      const span = part === "box"
        ? Math.max(frame.size[0], frame.size[2])
        : Math.max(frame.size[0], frame.size[2], fit.bottleW, fit.bottleD);
      anchor.current.addScaledVector(camRight.current, SIDES[part] * (span * 0.54 + 8));
      items.push({
        key: part,
        side: SIDES[part],
        order: ORDER[part],
        title: partLabel[state.lang][part],
        detail: partSize(part, state.design, fit),
        selected: state.selected === part,
        dim: false,
        anchor: anchor.current.clone(),
      });
    }

    if (showDims && state.selected && state.design[state.selected].visible) {
      const part = state.selected;
      if (state.stage === "bottle" && part === "box") {
        /* no box leader on the bottle stage */
      } else if (state.stage === "box" && part !== "box") {
        /* box stage only measures the carton */
      } else {
      const frame = posedFrame(part, fit, state.stage);
      const parked = state.solo === part;
      const local = parked ? 0 : explodeLocal(frame.index, clock.current);
      const home = parked ? turntableHome(frame) : frame.home;
      const burst = parked ? [0, 0, 0] : frame.explode;
      const [w, h, d] = frame.size;
      anchor.current.set(
        home[0] + burst[0] * local + frame.center[0],
        home[1] + burst[1] * local + frame.center[1],
        home[2] + burst[2] * local + frame.center[2],
      );
      items.push({
        key: `dim-${part}`,
        side: SIDES[part],
        order: ORDER[part] + 0.45,
        title: "",
        detail: `${w.toFixed(1)} × ${d.toFixed(1)} × ${h.toFixed(1)}`,
        selected: false,
        dim: true,
        anchor: anchor.current.clone(),
      });
      }
    }

    const rect = slot.getBoundingClientRect();
    const canvasRect = gl.domElement.getBoundingClientRect();
    const project = (point: THREE.Vector3) => {
      const p = point.clone().project(camera);
      if (p.z < -1 || p.z > 1) return null;
      const x = canvasRect.left + (p.x * 0.5 + 0.5) * canvasRect.width - rect.left;
      const y = canvasRect.top + (-p.y * 0.5 + 0.5) * canvasRect.height - rect.top;
      return { x, y };
    };

    const left = items.filter((item) => item.side < 0).sort((a, b) => a.order - b.order);
    const right = items.filter((item) => item.side > 0).sort((a, b) => a.order - b.order);
    const top = 42;
    const bottom = Math.max(top + 40, rect.height - 96);
    const placeColumn = (column: Slot[], side: -1 | 1) => {
      const row = column.length > 1 ? Math.min(40, (bottom - top) / column.length) : 40;
      const stack = column.length * row;
      const start = top + Math.max(0, (bottom - top - stack) / 2);
      return column.map((item, index) => ({
        item,
        x: side < 0 ? 8 : rect.width - 8,
        y: start + index * row + row / 2,
      }));
    };
    const placed = [...placeColumn(left, -1), ...placeColumn(right, 1)];

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const tags = [...root.querySelectorAll<HTMLDivElement>(".callout-tag")];
    while (tags.length < placed.length) {
      const tag = document.createElement("div");
      tag.className = "callout-tag";
      root.appendChild(tag);
      tags.push(tag);
    }
    while (tags.length > placed.length) {
      tags.pop()?.remove();
    }

    placed.forEach((entry, index) => {
      const point = project(entry.item.anchor);
      const tag = tags[index];
      if (!tag) return;
      tag.className = `callout-tag ${entry.item.dim ? "dim-tag" : "explode-tag is-hit"}${entry.item.selected ? " is-sel" : ""}${entry.item.side > 0 ? " is-right" : ""}`;
      tag.dataset.part = entry.item.dim ? "" : entry.item.key;
      tag.onclick = () => {
        const key = tag.dataset.part;
        if (key) clickPart(key as PartKey, true);
      };
      tag.style.left = `${entry.x}px`;
      tag.style.top = `${entry.y}px`;
      const name = entry.item.dim ? "" : `<b>${entry.item.title}</b>`;
      const detail = entry.item.detail ? `<span dir="ltr">${entry.item.detail}</span>` : "";
      const html = `${name}${detail}`;
      if (tag.innerHTML !== html) tag.innerHTML = html;
      const width = tag.offsetWidth || 80;
      const endX = entry.item.side < 0 ? entry.x + width : entry.x - width;
      if (!point || entry.item.dim) return;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(point.x));
      line.setAttribute("y1", String(point.y));
      line.setAttribute("x2", String(endX));
      line.setAttribute("y2", String(entry.y));
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(point.x));
      dot.setAttribute("cy", String(point.y));
      dot.setAttribute("r", "2.2");
      svg.appendChild(line);
      svg.appendChild(dot);
    });
  });

  return null;
}
