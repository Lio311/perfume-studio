/**
 * @vitest-environment happy-dom
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PullRibbon } from "../kit.tsx";
import { DRAWER_RIBBON_REACH, drawerInsertSeatOffset, drawerRibbonPose, drawerTrayFront, drawerTrayWall } from "./drawer.tsx";

describe("drawer front", () => {
  it("covers the sleeve opening when closed", () => {
    const wall = 2.2;
    const height = 68;
    const front = drawerTrayFront(height, wall);
    expect(front.opening).toBeCloseTo(height - 2 * wall, 5);
    expect(Math.abs(front.trayH - front.opening)).toBeLessThan(1);
    expect(front.y).toBeCloseTo(wall + 0.2, 5);
    expect(front.y).toBeGreaterThan(wall);
    expect(front.y + front.trayH).toBeLessThan(height - wall);
    const board = 2.2;
    const offset = drawerInsertSeatOffset(wall, board);
    expect(offset).toBeCloseTo(front.y + drawerTrayWall(wall) - board, 5);
    expect(offset).toBeGreaterThan(1.5);
    expect(offset).toBeLessThan(3);
  });

  it("renders a ribbon when the pull is ribbon", () => {
    expect(drawerRibbonPose("none", 60, 70)).toBeNull();
    expect(drawerRibbonPose("notch", 60, 70)).toBeNull();
    const pose = drawerRibbonPose("ribbon", 60, 70);
    expect(pose).toBeTruthy();
    expect(pose!.y).toBeGreaterThan(0);
    expect(pose!.y).toBeLessThan(60 * 0.4);
    expect(pose!.z).toBeGreaterThan(70 / 2);
    const markup = renderToStaticMarkup(createElement(PullRibbon, { y: pose!.y, z: pose!.z }));
    expect(markup.toLowerCase()).toContain("torusgeometry");
    expect(markup).toContain("8d1d32");
  });

  it("keeps the ribbon above the floor on a short box", () => {
    const wall = 2.2;
    const front = drawerTrayFront(60, wall);
    const pose = drawerRibbonPose("ribbon", front.trayH, 50, wall);
    expect(pose).toBeTruthy();
    expect(pose!.y - DRAWER_RIBBON_REACH).toBeGreaterThanOrEqual(wall - 1e-6);
    expect(front.trayH).toBeLessThan(75);
  });
});
