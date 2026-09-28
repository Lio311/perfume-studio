import { describe, expect, it } from "vitest";
import {
  clampLabelText,
  contrastingPlate,
  contrastRatio,
  labelDirection,
  labelFontFamily,
  labelFontWeight,
  labelTypeface,
  layoutLabelLines,
  paintLabel,
  relativeLuminance,
  shouldRepaintLabel,
} from "./logos.ts";

function measure(line: string, px: number): number {
  return [...line].length * px * 0.55;
}

describe("label text layout", () => {
  it("follows the first strong letter, not a later Hebrew character", () => {
    expect(labelDirection("בושם שלי 2026")).toBe("rtl");
    expect(labelDirection("בושם NOIR 7")).toBe("rtl");
    expect(labelDirection("  2026 בושם")).toBe("rtl");
    expect(labelDirection("ATELIER")).toBe("ltr");
    expect(labelDirection("ATELIER בושם")).toBe("ltr");
    expect(labelDirection("Noir 01")).toBe("ltr");
    expect(labelDirection("2026")).toBe("ltr");
  });

  it("uses Heebo for a right-to-left paragraph and the chosen face for Latin", () => {
    expect(labelTypeface("cinzel", "בושם")).toBe("Heebo");
    expect(labelTypeface("cinzel", "בושם NOIR 7")).toBe("Heebo");
    expect(labelTypeface("cinzel", "NOIR בושם")).toBe("Cinzel");
    expect(labelFontFamily("vibes", "ATELIER")).toContain("Great Vibes");
    expect(labelFontFamily("heebo", "בושם")).toContain("Heebo");
    expect(labelFontWeight("vibes", "ATELIER")).toBe(400);
    expect(labelFontWeight("italiana", "ATELIER")).toBe(400);
    expect(labelFontWeight("cinzel", "ATELIER")).toBe(600);
    expect(labelFontWeight("cinzel", "בושם")).toBe(600);
  });

  it("puts gold ink on a dark plate and black ink on a light plate", () => {
    expect(relativeLuminance("#D6B26A")).toBeGreaterThan(0.42);
    expect(contrastingPlate("#D6B26A")).toBe("#16130f");
    expect(contrastingPlate("#141414")).toBe("#f7f2e8");
  });

  it("picks the plate with the higher contrast for mid colours and non-hex ink", () => {
    const inks = ["#44bbdd", "#c9a36a", "#8ea0ae", "#8d9a84", "#fff", "white", "rgb(255, 255, 255)", "rgb(68, 187, 221)"];
    for (const ink of inks) {
      const plate = contrastingPlate(ink);
      const chosen = contrastRatio(ink, plate);
      const other = contrastRatio(ink, plate === "#16130f" ? "#f7f2e8" : "#16130f");
      expect(chosen, ink).toBeGreaterThanOrEqual(other);
      expect(chosen, ink).toBeGreaterThan(3);
    }
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("white")).toBeCloseTo(relativeLuminance("#fff"), 5);
    expect(relativeLuminance("rgb(255, 255, 255)")).toBeCloseTo(relativeLuminance("#ffffff"), 5);
    expect(relativeLuminance("#44bbdd")).toBeGreaterThan(0.2);
    expect(contrastingPlate("#fff")).toBe("#16130f");
    expect(contrastingPlate("white")).toBe("#16130f");
    expect(contrastingPlate("rgb(255, 255, 255)")).toBe("#16130f");
    expect(contrastingPlate("#44bbdd")).toBe("#16130f");
    expect(contrastingPlate("#c9a36a")).toBe("#16130f");
  });

  it("truncates by code points so an emoji is not split", () => {
    const wave = "👋";
    expect(clampLabelText(wave.repeat(40))).toBe(wave.repeat(32));
    const boundary = "a".repeat(31) + wave;
    expect(clampLabelText(boundary)).toBe(boundary);
    expect(boundary.slice(0, 32)).not.toBe(boundary);
    expect(Array.from(clampLabelText(boundary))).toHaveLength(32);
  });

  it("repaints only when a new face loads", () => {
    expect(shouldRepaintLabel(true)).toBe(false);
    expect(shouldRepaintLabel(false)).toBe(true);
  });

  it("draws nothing when the brand text is empty", () => {
    const ctx = fakeCtx();
    paintLabel(ctx as unknown as CanvasRenderingContext2D, { mark: "word", font: "cinzel", frame: "none" }, "   ", "#D6B26A", 640, 360);
    expect(ctx.texts).toHaveLength(0);
    expect(ctx.texts.some((call) => call.text.includes("Nº"))).toBe(false);
  });

  it("finds a fitting size with few measurements", () => {
    let calls = 0;
    const counting = (line: string, px: number) => {
      calls += 1;
      return measure(line, px);
    };
    const wrapped = layoutLabelLines("בושם שלי 2026", 200, 120, counting);
    expect(wrapped.lines.length).toBeGreaterThan(1);
    expect(calls).toBeLessThan(80);
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
    expect(english[0]?.font.startsWith("600 ")).toBe(true);
    expect(english[0]?.fill).toBe("#f4efe6");

    ctx.texts.length = 0;
    paintLabel(ctx as unknown as CanvasRenderingContext2D, { mark: "word", font: "vibes", frame: "none" }, "ATELIER", "#f4efe6", 640, 360);
    expect(ctx.texts[0]?.font.startsWith("400 ")).toBe(true);
    expect(ctx.texts[0]?.font).toContain("Great Vibes");
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
