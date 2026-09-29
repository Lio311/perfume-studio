/**
 * @vitest-environment happy-dom
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PullRibbon } from "../kit.tsx";
import { drawerRibbonPose, drawerTrayFront } from "./drawer.tsx";

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
});
