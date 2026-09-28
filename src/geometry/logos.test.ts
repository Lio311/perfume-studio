import { describe, expect, it } from "vitest";
import { PALETTE } from "../model/materials.ts";
import {
  clampLabelText,
  contrastingPlate,
  contrastRatio,
  FOIL_ENV_FLOOR,
  labelDirection,
  labelEmissive,
  labelFinish,
  labelFontFamily,
  labelFontWeight,
  labelInk,
  labelTypeface,
  layoutLabelLines,
  cartonMarkPlate,
  paintLabel,
  paintLabelEmissive,
  paintLabelSurface,
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

  it("keeps the chosen ink and finishes each application differently", () => {
    expect(labelInk("#D6B26A", "foil")).toBe("#D6B26A");
    expect(labelInk("#D6B26A", "emboss")).toBe("#D6B26A");
    expect(labelInk("#D6B26A", "engrave")).toBe("#D6B26A");
    expect(labelInk("#D6B26A", "decal")).toBe("#D6B26A");
    expect(labelFinish("decal")).toEqual({ metalness: 0, roughness: 1, bumpScale: 0, envMapIntensity: 1, emissive: 0 });
    expect(labelFinish("foil")).toEqual({ metalness: 1, roughness: 0.4, bumpScale: 0, envMapIntensity: FOIL_ENV_FLOOR, emissive: 0.36 });
    expect(labelFinish("emboss")).toEqual({ metalness: 0.04, roughness: 0.55, bumpScale: 3.2, envMapIntensity: 1, emissive: 0 });
    expect(labelFinish("engrave")).toEqual({ metalness: 0.04, roughness: 0.55, bumpScale: -3.2, envMapIntensity: 1, emissive: 0 });
  });

  it("pins foil roughness, an environment floor, and emissive in the ink colour", () => {
    const foil = labelFinish("foil");
    expect(foil.roughness).toBeGreaterThanOrEqual(0.35);
    expect(foil.roughness).toBeLessThanOrEqual(0.45);
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
        source[index + 3] = 255;
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
        source[index + 3] = 255;
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

    const word = { mark: "word" as const, font: "cinzel" as const, frame: "none" as const };
    const empty = fakeCtx();
    paintLabel(empty, word, "", "#f6f1e6", 640, 180, cartonMarkPlate("foil"));
    expect(empty.plate).toBe("");
    expect(empty.cleared).toBe(true);
    expect(empty.texts).toHaveLength(0);

    const foil = fakeCtx();
    paintLabel(foil, word, "ATELIER", "#e6cc98", 640, 180, cartonMarkPlate("foil", "#16130f"));
    expect(foil.plate).toBe("");
    expect(foil.texts.some((call) => call.text === "ATELIER")).toBe(true);
    expect(foil.texts.some((call) => call.fill === "#16130f")).toBe(false);

    const printed = fakeCtx();
    paintLabel(printed, word, "ATELIER", "#16130f", 640, 180, cartonMarkPlate("print", "#f4efe6"));
    expect(printed.plate).toBe("#f4efe6");
    expect(printed.plate).not.toBe("#16130f");
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
