import { describe, expect, it } from "vitest";
import {
  contrastingPlate,
  labelDirection,
  labelFontFamily,
  labelTypeface,
  layoutLabelLines,
  paintLabel,
  relativeLuminance,
} from "./logos.ts";

function measure(line: string, px: number): number {
  return [...line].length * px * 0.55;
}

describe("label text layout", () => {
  it("keeps Hebrew right to left and English left to right", () => {
    expect(labelDirection("בושם שלי 2026")).toBe("rtl");
    expect(labelDirection("בושם NOIR 7")).toBe("rtl");
    expect(labelDirection("ATELIER")).toBe("ltr");
    expect(labelDirection("Noir 01")).toBe("ltr");
    expect(labelDirection("2026")).toBe("ltr");
  });

  it("uses Heebo for Hebrew and the chosen face for Latin", () => {
    expect(labelTypeface("cinzel", "בושם")).toBe("Heebo");
    expect(labelTypeface("cinzel", "בושם NOIR 7")).toBe("Heebo");
    expect(labelFontFamily("vibes", "ATELIER")).toContain("Great Vibes");
    expect(labelFontFamily("heebo", "בושם")).toContain("Heebo");
  });

  it("puts gold ink on a dark plate and black ink on a light plate", () => {
    expect(relativeLuminance("#D6B26A")).toBeGreaterThan(0.42);
    expect(contrastingPlate("#D6B26A")).toBe("#16130f");
    expect(contrastingPlate("#141414")).toBe("#f7f2e8");
  });

  it("wraps a long brand so each line can be larger, without reversing or cutting it", () => {
    const text = "בושם שלי 2026";
    let single = Math.floor(120 / 1.16);
    while (single > 18 && measure(text, single) > 200) single -= 2;
    const wrapped = layoutLabelLines(text, 200, 120, measure);
    const wide = layoutLabelLines(text, 800, 160, measure);
    expect(wrapped.lines.join(" ")).toBe(text);
    expect(wrapped.direction).toBe("rtl");
    expect(wrapped.lines.length).toBeGreaterThan(1);
    expect(wrapped.px).toBeGreaterThan(single);
    expect(wrapped.lines.some((line) => line.includes("2026"))).toBe(true);
    expect(wide.lines).toEqual([text]);
    expect(text.length).toBeGreaterThan(12);
  });

  it("redraws when the text, direction, font, or colour changes", () => {
    const ctx = fakeCtx();
    const diamond = { mark: "diamond" as const, font: "cinzel" as const, frame: "corners" as const };
    paintLabel(ctx as unknown as CanvasRenderingContext2D, diamond, "בושם שלי 2026", "#D6B26A", 640, 480);
    const hebrew = ctx.texts.filter((call) => call.text.includes("בושם") || call.text.includes("2026"));
    expect(hebrew.length).toBeGreaterThan(0);
    expect(hebrew.every((call) => call.direction === "rtl")).toBe(true);
    expect(hebrew.every((call) => call.font.includes("Heebo"))).toBe(true);
    expect(hebrew.every((call) => call.fill === "#D6B26A")).toBe(true);
    expect(ctx.plate).toBe("#16130f");
    expect(hebrew.map((call) => call.text).join(" ")).toBe("בושם שלי 2026");

    ctx.texts.length = 0;
    paintLabel(ctx as unknown as CanvasRenderingContext2D, { mark: "word", font: "cinzel", frame: "none" }, "ATELIER", "#f4efe6", 640, 360);
    const english = ctx.texts.filter((call) => call.text === "ATELIER");
    expect(english).toHaveLength(1);
    expect(english[0]?.direction).toBe("ltr");
    expect(english[0]?.font).toContain("Cinzel");
    expect(english[0]?.fill).toBe("#f4efe6");
  });
});

function fakeCtx() {
  const texts: Array<{ text: string; direction: string; font: string; fill: string }> = [];
  const ctx = {
    canvas: { dir: "ltr", setAttribute(_name: string, value: string) { ctx.canvas.dir = value; } },
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    direction: "ltr" as "rtl" | "ltr",
    lineWidth: 1,
    plate: "",
    texts,
    fillRect() {
      if (!ctx.plate) ctx.plate = String(ctx.fillStyle);
    },
    fillText(text: string) {
      texts.push({ text, direction: ctx.direction, font: ctx.font, fill: String(ctx.fillStyle) });
    },
    measureText(text: string) {
      const px = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 16);
      return { width: [...text].length * px * 0.55 };
    },
    save() {},
    restore() {},
    translate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    strokeRect() {},
    arc() {},
    ellipse() {},
    bezierCurveTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() {},
  };
  return ctx as typeof ctx & CanvasRenderingContext2D;
}
