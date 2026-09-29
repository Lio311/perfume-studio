import { describe, expect, it } from "vitest";
import { PALETTE } from "../model/materials.ts";
import {
  clampLabelText,
  contrastingPlate,
  contrastRatio,
  EMBOSS_SUBSTRATE,
  FOIL_ENV_FLOOR,
  FOIL_GOLD,
  FOIL_SILVER,
  labelDirection,
  labelEmissive,
  labelFinish,
  labelFontFamily,
  labelFontWeight,
  labelInk,
  labelTypeface,
  layoutLabelLines,
  cartonMarkSize,
  cartonTextAspect,
  paintCartonMark,
  cartonMarkPlate,
  paintLabel,
  paintLabelEmissive,
  paintLabelSurface,
  relativeLuminance,
  relieveLabelPixels,
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
    expect(labelFontFamily("cinzel", "NOIR בושם")).toContain("Cinzel");
    expect(labelFontFamily("cinzel", "NOIR בושם")).toContain("Heebo");
    expect(labelFontFamily("vibes", "ATELIER בושם")).toContain("Heebo");
    expect(labelFontFamily("vibes", "ATELIER")).toContain("Great Vibes");
    expect(labelFontFamily("heebo", "בושם")).toContain("Heebo");
    expect(labelFontWeight("vibes", "ATELIER")).toBe(400);
    expect(labelFontWeight("italiana", "ATELIER")).toBe(400);
    expect(labelFontWeight("cormorant", "ATELIER")).toBe(500);
    expect(labelFontWeight("cinzel", "ATELIER")).toBe(500);
    expect(labelFontWeight("heebo", "NOIR")).toBe(500);
    expect(labelFontWeight("cinzel", "בושם")).toBe(500);
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

  it("keeps at least 3:1 contrast for every label palette colour", () => {
    for (const ink of PALETTE) {
      const plate = contrastingPlate(ink);
      expect(contrastRatio(ink, plate), `${ink} on ${plate}`).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio("#c9a36a", contrastingPlate("#c9a36a"))).toBeGreaterThanOrEqual(3);
  });

  it("does not parse short hex, colour names, or rgb() as black", () => {
    const lights = ["#fff", "#FFF", "white", "rgb(255, 255, 255)", "rgb(255,255,255)"];
    for (const ink of lights) {
      expect(relativeLuminance(ink), ink).toBeGreaterThan(0.9);
      expect(relativeLuminance(ink), ink).not.toBe(0);
      expect(contrastingPlate(ink), ink).toBe("#16130f");
    }
  });

  it("truncates by code points so an emoji is not split", () => {
    const wave = "👋";
    expect(clampLabelText(wave.repeat(40))).toBe(wave.repeat(32));
    const boundary = "a".repeat(31) + wave;
    expect(clampLabelText(boundary)).toBe(boundary);
    expect(boundary.slice(0, 32)).not.toBe(boundary);
    expect(Array.from(clampLabelText(boundary))).toHaveLength(32);
  });

  it("counts a joiner sequence and Hebrew niqqud as one grapheme", () => {
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";
    expect(Array.from(family).length).toBeGreaterThan(1);
    expect(clampLabelText(family.repeat(40))).toBe(family.repeat(32));
    const boundary = "a".repeat(31) + family;
    expect(clampLabelText(boundary)).toBe(boundary);
    expect(Array.from(boundary).length).toBeGreaterThan(32);
    expect(clampLabelText("a".repeat(32) + family)).toBe("a".repeat(32));

    const pointed = "\u05D1\u05BC";
    expect(Array.from(pointed)).toHaveLength(2);
    const hebrew = "\u05D0".repeat(31) + pointed;
    expect(clampLabelText(hebrew)).toBe(hebrew);
    expect(clampLabelText("\u05D0".repeat(32) + pointed)).toBe("\u05D0".repeat(32));
  });

  it("falls back to code points when Segmenter is missing", () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, "Segmenter");
    Object.defineProperty(Intl, "Segmenter", { value: undefined, configurable: true });
    try {
      const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";
      const clamped = clampLabelText(family.repeat(10));
      expect(Array.from(clamped)).toHaveLength(32);
      expect(clamped).not.toBe(family.repeat(10));
    } finally {
      if (descriptor) Object.defineProperty(Intl, "Segmenter", descriptor);
    }
  });

  it("gives each application its own ink and finish", () => {
    expect(labelInk("#D6B26A", "decal")).toBe("#D6B26A");
    expect(labelInk("#D6B26A", "foil")).toBe(FOIL_GOLD);
    expect(labelInk("#d5d8de", "foil")).toBe(FOIL_SILVER);
    expect(labelInk("#D6B26A", "emboss")).toBe(EMBOSS_SUBSTRATE);
    expect(labelInk("#D6B26A", "emboss", "#2a2c2b")).toBe("#2a2c2b");
    const etch = labelInk("#D6B26A", "engrave");
    expect(etch).not.toBe("#D6B26A");
    expect(relativeLuminance(etch)).toBeLessThan(relativeLuminance("#D6B26A"));
    expect(labelFinish("decal")).toEqual({ metalness: 0, roughness: 1, bumpScale: 0, envMapIntensity: 1, emissive: 0 });
    expect(labelFinish("foil")).toEqual({ metalness: 0.86, roughness: 0.14, bumpScale: 0, envMapIntensity: 2.8, emissive: 1.05 });
    expect(labelFinish("emboss")).toEqual({ metalness: 0.02, roughness: 0.42, bumpScale: 16, envMapIntensity: 0.35, emissive: 0 });
    expect(labelFinish("engrave")).toEqual({ metalness: 0, roughness: 0.94, bumpScale: -14, envMapIntensity: 0.15, emissive: 0 });
  });

  it("pins foil roughness, an environment floor, and emissive in the ink colour", () => {
    const foil = labelFinish("foil");
    expect(foil.roughness).toBeGreaterThan(0.05);
    expect(foil.roughness).toBeLessThanOrEqual(0.22);
    expect(foil.metalness).toBeGreaterThan(0.45);
    expect(foil.emissive).toBeGreaterThanOrEqual(1);
    expect(FOIL_ENV_FLOOR).toBeGreaterThan(0);
    expect(foil.envMapIntensity).toBeGreaterThanOrEqual(FOIL_ENV_FLOOR);
    expect(foil.emissive).toBeGreaterThan(0);
    expect(labelEmissive("#c9a36a", "foil")).toBe("#c9a36a");
    expect(labelEmissive("#141414", "foil")).toBe("#141414");
    expect(labelEmissive("#c9a36a", "emboss")).toBe("#000000");
    expect(labelEmissive("#c9a36a", "engrave")).toBe("#000000");
    expect(labelEmissive("#c9a36a", "decal")).toBe("#000000");
    expect(labelFinish("emboss").emissive).toBe(0);
    expect(labelFinish("engrave").emissive).toBe(0);
    expect(labelFinish("decal").emissive).toBe(0);

    const width = 32;
    const height = 32;
    const source = new Uint8ClampedArray(width * height * 4);
    const plate: [number, number, number] = [0x16, 0x13, 0x0f];
    const ink: [number, number, number] = [0xc9, 0xa3, 0x6a];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const on = x >= 8 && x < 24 && y >= 8 && y < 24;
        const rgb = on ? ink : plate;
        source[index] = rgb[0];
        source[index + 1] = rgb[1];
        source[index + 2] = rgb[2];
        source[index + 3] = on ? 255 : 0;
      }
    }
    const target = new Uint8ClampedArray(source.length);
    paintLabelEmissive(source, "#c9a36a", "foil", target);
    const at = (x: number, y: number) => target[(y * width + x) * 4];
    expect(at(2, 2)).toBe(0);
    expect(at(16, 16)).toBe(255);
    paintLabelEmissive(source, "#c9a36a", "emboss", target);
    expect(at(16, 16)).toBe(0);
    paintLabelEmissive(source, "#c9a36a", "decal", target);
    expect(at(16, 16)).toBe(0);
  });

  it("masks metal and height to the ink so the plate stays matte", () => {
    const width = 48;
    const height = 48;
    const source = new Uint8ClampedArray(width * height * 4);
    const plate: [number, number, number] = [0x16, 0x13, 0x0f];
    const ink: [number, number, number] = [0xd6, 0xb2, 0x6a];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const on = x >= 16 && x < 32 && y >= 16 && y < 32;
        const rgb = on ? ink : plate;
        source[index] = rgb[0];
        source[index + 1] = rgb[1];
        source[index + 2] = rgb[2];
        source[index + 3] = on ? 255 : 0;
      }
    }
    const target = new Uint8ClampedArray(source.length);
    const at = (x: number, y: number) => {
      const index = (y * width + x) * 4;
      return [target[index], target[index + 1], target[index + 2]] as const;
    };
    paintLabelSurface(source, "#D6B26A", "foil", target, width, height);
    const platePixel = at(2, 2);
    const inkPixel = at(24, 24);
    expect(platePixel[0]).toBe(0);
    expect(platePixel[1]).toBe(255);
    expect(platePixel[2]).toBe(0);
    expect(inkPixel[0]).toBe(255);
    expect(inkPixel[1]).toBe(Math.round(labelFinish("foil").roughness * 255));
    expect(inkPixel[2]).toBe(255);
    paintLabelSurface(source, "#D6B26A", "emboss", target, width, height);
    expect(at(24, 24)[0]).toBeGreaterThan(200);
    expect(at(2, 2)[0]).toBe(0);
    expect(contrastingPlate("#D6B26A")).toBe("#16130f");
  });

  it("gives a transparent margin no coverage, metal, or glow", () => {
    const source = new Uint8ClampedArray(8);
    source.set([0xd6, 0xb2, 0x6a, 0, 0xd6, 0xb2, 0x6a, 255]);
    const target = new Uint8ClampedArray(8);
    paintLabelSurface(source, "#D6B26A", "foil", target, 2, 1);
    expect(target[0]).toBe(0);
    expect(target[2]).toBe(0);
    expect(target[6]).toBe(255);
    paintLabelEmissive(source, "#D6B26A", "foil", target);
    expect(target[0]).toBe(0);
    expect(target[1]).toBe(0);
    expect(target[2]).toBe(0);
    expect(target[4]).toBeGreaterThan(0);
  });

  it("bakes a different mark for foil, engrave, and emboss", () => {
    const width = 40;
    const height = 32;
    const source = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const on = x >= 8 && x < 30 && y >= 6 && y < 26;
        source[index] = on ? 0xff : 0;
        source[index + 1] = on ? 0xe7 : 0;
        source[index + 2] = on ? 0xa6 : 0;
        source[index + 3] = on ? 255 : 0;
      }
    }
    const mean = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i + 3] === 0 && b[i + 3] === 0) continue;
        sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        count += 3;
      }
      return count === 0 ? 0 : sum / count;
    };
    const foil = new Uint8ClampedArray(source);
    const engrave = new Uint8ClampedArray(source);
    const emboss = new Uint8ClampedArray(source);
    const print = new Uint8ClampedArray(source);
    relieveLabelPixels(foil, width, height, "foil");
    relieveLabelPixels(engrave, width, height, "engrave");
    relieveLabelPixels(emboss, width, height, "emboss");
    relieveLabelPixels(print, width, height, "decal");
    expect(mean(print, source)).toBe(0);
    expect(mean(foil, engrave)).toBeGreaterThan(25);
    expect(mean(foil, emboss)).toBeGreaterThan(15);
    expect(mean(engrave, emboss)).toBeGreaterThan(25);
    const at = (buf: Uint8ClampedArray, x: number, y: number) => {
      const index = (y * width + x) * 4;
      return [buf[index], buf[index + 1], buf[index + 2]] as const;
    };
    const luma = (rgb: readonly [number, number, number]) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    const frost = at(engrave, 20, 16);
    const rim = at(engrave, 8, 6);
    expect(luma(frost)).toBeGreaterThan(150);
    expect(luma(frost)).toBeLessThan(200);
    expect(frost[2]).toBeGreaterThan(frost[0] + 10);
    expect(luma(rim)).toBeLessThan(50);
    const grey = new Uint8ClampedArray(source);
    for (let i = 0; i < grey.length; i += 4) {
      if (grey[i + 3] === 0) continue;
      grey[i] = 160;
      grey[i + 1] = 154;
      grey[i + 2] = 146;
    }
    relieveLabelPixels(grey, width, height, "emboss");
    const face = at(grey, 20, 16);
    let brightest = 0;
    let darkest = 255;
    for (let y = 6; y < 26; y += 1) {
      for (let x = 8; x < 30; x += 1) {
        const value = luma(at(grey, x, y));
        brightest = Math.max(brightest, value);
        darkest = Math.min(darkest, value);
      }
    }
    expect(luma(face)).toBeGreaterThan(140);
    expect(luma(face)).toBeLessThan(190);
    expect(brightest).toBeGreaterThan(luma(face) + 8);
    expect(brightest).toBeLessThan(220);
    expect(darkest).toBeLessThan(luma(face) - 20);
    const foilBody = at(foil, 20, 16);
    expect(foilBody[0]).toBeGreaterThan(foilBody[2] + 80);
    expect(foilBody[2]).toBeLessThan(140);
    expect(luma(foilBody)).toBeLessThan(210);
    const cream = new Uint8ClampedArray(source);
    for (let i = 0; i < cream.length; i += 4) {
      if (cream[i + 3] === 0) continue;
      cream[i] = 243;
      cream[i + 1] = 239;
      cream[i + 2] = 230;
    }
    relieveLabelPixels(cream, width, height, "emboss");
    let creamPeak = 0;
    for (let y = 6; y < 26; y += 1) {
      for (let x = 8; x < 30; x += 1) {
        const rgb = at(cream, x, y);
        creamPeak = Math.max(creamPeak, rgb[0], rgb[1], rgb[2]);
      }
    }
    expect(creamPeak).toBeLessThanOrEqual(243);
  });

  it("repaints only when a new face loads", () => {
    expect(shouldRepaintLabel(true)).toBe(false);
    expect(shouldRepaintLabel(false)).toBe(true);
  });

  it("keeps the carton plaque clear unless print has a plate colour", () => {
    expect(cartonMarkPlate("foil", "#111111")).toBe("clear");
    expect(cartonMarkPlate("emboss", "#111111")).toBe("clear");
    expect(cartonMarkPlate("engrave", "#111111")).toBe("clear");
    expect(cartonMarkPlate("decal", null)).toBe("clear");
    expect(cartonMarkPlate("decal", "  ")).toBe("clear");
    expect(cartonMarkPlate("print", "")).toBe("clear");
    expect(cartonMarkPlate("print", "#f4efe6")).toBe("#f4efe6");
    expect(cartonMarkPlate("decal", "#f4efe6")).toBe("#f4efe6");
  });

  it("paints carton foil and engrave on a clear ground, and keeps a plate only for print", () => {
    const foil = fakeCtx();
    paintCartonMark(foil as unknown as CanvasRenderingContext2D, { font: "cinzel" }, "ATELIER", "#c9a36a", 640, 180, "foil");
    expect(foil.plate).toBe("");
    expect(foil.cleared).toBe(true);
    expect(foil.texts.filter((call) => call.text === "ATELIER")).toHaveLength(1);
    expect(foil.texts[0]?.fill).toBe("#c9a36a");
    const engrave = fakeCtx();
    paintCartonMark(engrave as unknown as CanvasRenderingContext2D, { font: "cormorant" }, "ATELIER", "#c9a36a", 640, 180, "engrave");
    expect(engrave.plate).toBe("");
    const emboss = fakeCtx();
    paintCartonMark(emboss as unknown as CanvasRenderingContext2D, { font: "cinzel" }, "ATELIER", "#c9a36a", 640, 180, "emboss");
    expect(emboss.plate).toBe("");
    const print = fakeCtx();
    paintCartonMark(print as unknown as CanvasRenderingContext2D, { font: "cinzel" }, "ATELIER", "#c9a36a", 640, 180, "decal");
    expect(print.plate).toBe("#16130f");
    expect(print.texts.some((call) => call.text === "ATELIER")).toBe(true);
  });

  it("sizes a wide brand line to most of 52 mm and keeps a tall mark within 18 mm", () => {
    const aspect = cartonTextAspect("ATELIER", measure);
    expect(aspect).toBeGreaterThan(2.4);
    const wide = cartonMarkSize(90, aspect);
    expect(wide.width).toBeGreaterThan(48);
    expect(wide.height).toBeLessThanOrEqual(18);
    expect(wide.width / wide.height).toBeCloseTo(aspect, 5);
    const hebrew = cartonTextAspect("אטלייה", measure);
    expect(hebrew).toBeGreaterThan(2);
    const tall = cartonMarkSize(90, 0.5);
    expect(tall.height).toBe(18);
    expect(tall.width).toBeCloseTo(9, 5);
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
    expect(wrapped.lines.length).toBe(2);
    for (const line of wrapped.lines) {
      expect(line.length).toBeGreaterThan(0);
      expect([...line].length).toBeLessThan([...text].length);
      expect(measure(line, wrapped.px)).toBeLessThanOrEqual(200);
    }
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
    expect(english[0]?.font).toContain("Heebo");
    expect(english[0]?.font.startsWith("500 ")).toBe(true);
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
    cleared: false,
    texts,
    clearRect() {
      ctx.cleared = true;
    },
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
