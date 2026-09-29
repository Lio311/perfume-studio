import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { BOX_CLOSED_MARK_AZIMUTH } from "../boxCamera.ts";
import { Ribbon, curvedRibbonArc, ribbonBandWidth } from "./kit.tsx";
import {
  FACET_RIBBON_YAW,
  closurePull,
  cylinderRibbonLayout,
  cylinderRibbonYaw,
  facetRibbonDiameter,
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
    expect(tube.sleeve?.radius).toBeCloseTo(radius + 0.35, 5);
    expect(tube.cap?.radius).toBeCloseTo(lidR + 0.3, 5);
    expect(tube.base?.cap).toBe(false);
    expect(tube.cap?.cap).toBe(true);

    const cylinder = cylinderRibbonLayout(h, h * 0.38, radius, lidR);
    const cylinderPieces = [cylinder.below, cylinder.above].filter((piece) => piece != null);
    expect(ribbonGaps(cylinderPieces, h)).toBeCloseTo(0, 5);
    expect(cylinder.below?.y).toBe(0);
    expect(cylinder.below?.radius).toBeCloseTo(radius + 0.3, 5);
    expect(cylinder.above?.radius).toBeCloseTo(lidR + 0.3, 5);
    expect(cylinder.above?.y).toBeCloseTo(h * 0.38, 5);
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
    expect(layout.above?.y).toBeCloseTo(90, 5);
    expect((layout.below?.y ?? 0) + (layout.below?.h ?? 0)).toBeCloseTo(90, 5);
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
    expect(FACET_RIBBON_YAW).toBeCloseTo(Math.PI / 2, 5);
    expect(Math.abs(FACET_RIBBON_YAW * 180 / Math.PI - 73.5)).toBeGreaterThan(10);
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
    expect(cylinders.length).toBe(4);
    const body = cylinders.filter((args) => args[0] === args[1]);
    const flare = cylinders.filter((args) => args[0] !== args[1]);
    expect(body).toHaveLength(2);
    expect(flare).toHaveLength(2);
    expect(body[0][2] + flare[0][2]).toBeCloseTo(40, 5);
    expect(body[0][3]).toBe(8);
    expect(body[0][5]).toBe(true);
    expect(body[0][6]).toBeCloseTo(arc.thetaStart, 5);
    expect(body[0][7]).toBeCloseTo(arc.theta, 5);
    expect(body[0][0]).toBeCloseTo(radius, 5);
    expect(body[1][0]).toBeLessThan(radius);
    expect(flare[0][0]).toBeCloseTo(radius + 0.7, 5);
    expect(flare[0][1]).toBeCloseTo(radius, 5);
  });
});
