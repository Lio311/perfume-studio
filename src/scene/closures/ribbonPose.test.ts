import { isValidElement, type ReactElement, type ReactNode } from "react";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { liftClosedY } from "../../model/closures/lift-off.ts";
import liftOff from "../../model/closures/lift-off.ts";
import { closureDims } from "../../model/closures/types.ts";
import { BOX_CLOSED_MARK_AZIMUTH } from "../boxCamera.ts";
import { Ribbon, curvedRibbonArc, ribbonBandWidth } from "./kit.tsx";
import {
  closurePull,
  cylinderRibbonLayout,
  cylinderRibbonYaw,
  facetRibbonDiameter,
  facetRibbonYaw,
  rectRibbonLayout,
  ribbonGaps,
  splitRibbon,
  tubeRibbonLayout,
} from "./ribbonPose.ts";
import { tubeMarkBand } from "./tubeMark.tsx";

function walk(node: ReactNode, visit: (el: ReactElement<{ args?: number[]; rotation?: [number, number, number]; position?: [number, number, number]; children?: ReactNode }>) => void) {
  if (!isValidElement(node)) return;
  const el = node as ReactElement<{ args?: number[]; rotation?: [number, number, number]; position?: [number, number, number]; children?: ReactNode }>;
  visit(el);
  const children = el.props.children;
  if (Array.isArray(children)) children.forEach((child) => walk(child, visit));
  else walk(children, visit);
}

describe("cylinder ribbon pose", () => {
  it("sits just past the mark, short of the silhouette", () => {
    const radius = 33.6;
    const lidR = radius + 0.7;
    const yaw = cylinderRibbonYaw(radius, lidR, 78, lidR * 2);
    const mark = tubeMarkBand(radius).angle;
    const degrees = (yaw * 180) / Math.PI;
    expect(yaw).toBeGreaterThan(BOX_CLOSED_MARK_AZIMUTH + mark / 2);
    expect(degrees).toBeGreaterThan(65);
    expect(degrees).toBeLessThan(85);
    expect(Math.abs(yaw - BOX_CLOSED_MARK_AZIMUTH)).toBeGreaterThan(0.4);
    expect(Math.abs(yaw - (BOX_CLOSED_MARK_AZIMUTH + Math.PI / 2))).toBeGreaterThan(0.4);
  });

  it("splits the ribbon at the seam and keeps the full height", () => {
    const h = 120;
    const start = h * 0.28;
    const seam = h * 0.38;
    const span = splitRibbon(start, h, seam);
    expect(span.below?.y).toBeCloseTo(start, 5);
    expect(span.above?.y).toBeCloseTo(seam, 5);
    expect((span.below?.h ?? 0) + (span.above?.h ?? 0)).toBeCloseTo(h - start, 5);
    const aboveSeam = splitRibbon(h * 0.55, h, h * 0.15);
    expect(aboveSeam.below).toBeNull();
    expect(aboveSeam.above?.h).toBeCloseTo(h * 0.45, 5);
  });

  it("covers the tube and the cylinder from the floor to the top", () => {
    const h = 117;
    const radius = 33.6;
    const lidR = radius + 0.7;
    const tube = tubeRibbonLayout(h, 18, 84, radius, lidR);
    const tubePieces = [tube.base, tube.sleeve, tube.cap].filter((piece) => piece != null);
    expect(ribbonGaps(tubePieces, h)).toBeCloseTo(0, 5);
    expect(tube.base?.y).toBe(0);
    expect(tube.base?.h).toBeCloseTo(18, 5);
    expect(tube.sleeve?.y).toBeCloseTo(18, 5);
    expect(tube.sleeve?.h).toBeCloseTo(66, 5);
    expect(tube.cap?.y).toBeCloseTo(84, 5);
    expect(tube.base?.radius).toBeCloseTo(radius + 0.3, 5);
    expect(tube.sleeve?.radius).toBeCloseTo(radius + 0.45, 5);
    expect(tube.cap?.radius).toBeCloseTo(lidR + 0.3, 5);
    expect(tube.base?.cap).toBe(false);
    expect(tube.cap?.cap).toBe(true);
  });

  it("covers each lift-off from the real lid origin, with the lid radius on the lid", () => {
    const box = { w: 78, h: 117, d: 68, boardMm: 2 };
    for (const variant of ["telescope-full", "telescope-partial", "shoulder-neck"] as const) {
      const dims = closureDims(box, liftOff, { variant, neckMm: 14, lidDepthMm: 28 });
      const lidY = liftClosedY(dims);
      const radius = Math.min(dims.w, dims.d) / 2 - 0.4;
      const lidR = radius + 0.7;
      const layout = cylinderRibbonLayout(dims.h, lidY, radius, lidR);
      const pieces = [layout.below, layout.above].filter((piece) => piece != null);
      expect(ribbonGaps(pieces, dims.h), variant).toBeCloseTo(0, 4);
      expect(layout.above, variant).toBeTruthy();
      expect(layout.above?.y, variant).toBeCloseTo(lidY, 4);
      expect(layout.above?.radius ?? 0, variant).toBeGreaterThanOrEqual(lidR);
      expect(layout.above?.y ?? 0, variant).toBeLessThanOrEqual(lidY);
      expect((layout.above?.y ?? 0) + (layout.above?.h ?? 0), variant).toBeCloseTo(dims.h, 4);
      const lidW = dims.neckH > 0 ? dims.w : dims.w + 1.6;
      const rect = rectRibbonLayout(dims.h, lidY, dims.w + 0.6, lidW + 0.6);
      const rectPieces = [rect.below, rect.above].filter((piece) => piece != null);
      expect(ribbonGaps(rectPieces, dims.h), variant).toBeCloseTo(0, 4);
      expect(rect.above?.y, variant).toBeCloseTo(lidY, 4);
      expect(rect.above?.cap, variant).toBe(true);
      if (variant === "telescope-full") {
        expect(lidY, variant).toBe(0);
        expect(layout.below, variant).toBeNull();
        expect(layout.above?.h, variant).toBeCloseTo(dims.h, 4);
      }
      if (variant === "telescope-partial") {
        expect(lidY, variant).toBeGreaterThan(dims.h * 0.4);
        expect(lidY, variant).toBeLessThan(dims.h - 10);
        expect(layout.above?.h ?? 0, variant).toBeGreaterThan(10);
        expect(layout.below?.y, variant).toBe(0);
      }
      if (variant === "shoulder-neck") {
        expect(lidY, variant).toBeGreaterThan(dims.baseH);
        expect(layout.below?.y, variant).toBe(0);
        expect((layout.below?.y ?? 0) + (layout.below?.h ?? 0), variant).toBeCloseTo(lidY, 4);
      }
    }
  });

  it("hides the pull tab when a ribbon is tied", () => {
    expect(closurePull(true, true)).toBe("ribbon");
    expect(closurePull(true, false)).toBe("ribbon");
    expect(closurePull(false, true)).toBe("tab");
    expect(closurePull(false, false)).toBeNull();
  });

  it("splits the rectangular ribbon onto the lid and keeps the base band on the walls", () => {
    const baseD = 78 + 0.6;
    const lidD = 78 + 1.6 + 0.6;
    const layout = rectRibbonLayout(120, 90, baseD, lidD);
    expect(layout.below?.d).toBeCloseTo(baseD, 5);
    expect(layout.above?.d).toBeCloseTo(lidD, 5);
    expect(layout.below?.cap).toBe(false);
    expect(layout.above?.cap).toBe(true);
    expect(layout.below?.y).toBe(0);
    expect(layout.above?.y).toBeCloseTo(90, 5);
    expect((layout.below?.y ?? 0) + (layout.below?.h ?? 0)).toBeCloseTo(90, 5);
    expect(ribbonGaps([layout.below, layout.above].filter((piece) => piece != null), 120)).toBeCloseTo(0, 5);
    const side = Ribbon({ w: 78, h: 40, d: baseD, y: 12, across: "x", cap: false });
    let rotation: [number, number, number] | undefined;
    const bands: number[] = [];
    walk(side, (el) => {
      if (el.type === "group" && el.props.rotation) rotation = el.props.rotation;
      if (el.type === "mesh" && el.props.position) bands.push(el.props.position[2]);
    });
    expect(rotation?.[1]).toBeCloseTo(Math.PI / 2, 5);
    expect(bands).toEqual([baseD / 2 + 0.3, -baseD / 2 - 0.3]);
  });

  it("centres an octagon ribbon on the side facet", () => {
    const lidR = 34.3;
    expect(facetRibbonYaw(8)).toBeCloseTo(Math.PI / 2, 5);
    const five = (Math.PI * 2) / 5;
    expect(facetRibbonYaw(5)).toBeCloseTo(five * Math.round((Math.PI / 2) / five), 5);
    expect(facetRibbonYaw(5)).not.toBeCloseTo(Math.PI / 2, 2);
    expect(Math.abs(facetRibbonYaw(8) * 180 / Math.PI - 73.5)).toBeGreaterThan(10);
    expect(facetRibbonDiameter(lidR, 8)).toBeCloseTo(2 * lidR * Math.cos(Math.PI / 8), 5);
    expect(facetRibbonDiameter(lidR, 8)).toBeLessThan(lidR * 2 - 1);
  });

  it("bends a curved ribbon around its radius and chamfers a seam step", () => {
    const radius = 34;
    const yaw = 1.2;
    const band = ribbonBandWidth(78, radius * 2);
    const arc = curvedRibbonArc(radius, band, yaw);
    expect(arc.segments).toBe(8);
    expect(arc.theta).toBeCloseTo(band / radius, 5);
    expect(arc.thetaStart).toBeCloseTo(yaw - arc.theta / 2, 5);
    const tree = Ribbon({
      w: 78,
      h: 40,
      d: radius * 2,
      y: 0,
      cap: true,
      bend: { radius, yaw, flareTo: radius + 0.7 },
    });
    const cylinders: number[][] = [];
    walk(tree, (el) => {
      if (el.type === "cylinderGeometry" && el.props.args) cylinders.push(el.props.args);
    });
    expect(cylinders.length).toBe(2);
    const body = cylinders.filter((args) => args[0] === args[1]);
    const flare = cylinders.filter((args) => args[0] !== args[1]);
    expect(body).toHaveLength(1);
    expect(flare).toHaveLength(1);
    expect(body[0][2] + flare[0][2]).toBeCloseTo(40, 5);
    expect(body[0][3]).toBe(8);
    expect(body[0][5]).toBe(true);
    expect(body[0][6]).toBeCloseTo(arc.thetaStart, 5);
    expect(body[0][7]).toBeCloseTo(arc.theta, 5);
    expect(body[0][0]).toBeCloseTo(radius, 5);
    expect(flare[0][0]).toBeCloseTo(radius + 0.7, 5);
    expect(flare[0][1]).toBeCloseTo(radius, 5);
    const sides: number[] = [];
    walk(tree, (el) => {
      if (el.type !== "meshPhysicalMaterial") return;
      const props = el.props as { side?: number; roughness?: number; envMapIntensity?: number; dithering?: boolean };
      expect(props.dithering).toBe(true);
      expect(props.roughness).toBeCloseTo(0.6, 5);
      expect(props.envMapIntensity).toBeCloseTo(0.6, 5);
      sides.push(props.side ?? THREE.FrontSide);
    });
    expect(sides).toEqual([THREE.FrontSide, THREE.FrontSide, THREE.FrontSide]);
  });
});
