import { describe, expect, it } from "vitest";
import { PALETTE } from "../model/materials.ts";
import {
  clampLabelText,
  contrastingPlate,
  contrastRatio,
  EMBOSS_SUBSTRATE,
  FOIL_CONTRAST_FLOOR,
  FOIL_ENV_FLOOR,
  FOIL_LOW_METALNESS,
  FOIL_METAL_MIN,
  foilDisplayInk,
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
  compositeEmbossPlatePixels,
  engraveAlpha,
  hairlineWidth,
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

  it("keeps the previous or default ink when a colour name is unknown", () => {
    expect(relativeLuminance("not-a-colour")).toBeCloseTo(relativeLuminance("#e6cc98"), 5);
    expect(relativeLuminance("not-a-colour")).not.toBeCloseTo(1, 1);
    expect(relativeLuminance("chartreuse", "#112233")).toBeCloseTo(relativeLuminance("#112233"), 5);
    expect(contrastingPlate("not-a-colour")).toBe(contrastingPlate("#e6cc98"));
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
    expect(labelInk("#d4a017", "plaque")).toBe("#d4a017");
    expect(labelInk("#f3f6fb", "plaque")).toBe("#f3f6fb");
    expect(labelInk("#D6B26A", "plaque")).toBe("#D6B26A");
    expect(labelInk("#b76e79", "plaque")).toBe("#b76e79");
    expect(labelInk("#000000", "plaque")).toBe("#000000");
    expect(labelInk("#111111", "plaque")).not.toBe("#f3f6fb");
    expect(labelInk("#D6B26A", "sticker")).toBe(EMBOSS_SUBSTRATE);
    expect(labelInk("#D6B26A", "sticker", "#16130f")).toBe("#16130f");
    expect(labelInk("#D6B26A", "engrave", "#16130f")).toBe("#16130f");
    expect(labelInk("#D6B26A", "engrave")).toBe(EMBOSS_SUBSTRATE);
    expect(labelFinish("decal")).toEqual({ metalness: 0, roughness: 1, bumpScale: 0, envMapIntensity: 1, emissive: 0 });
    expect(labelFinish("plaque")).toEqual({ metalness: 0.86, roughness: 0.18, bumpScale: 0, envMapIntensity: 2.8, emissive: 1.05 });
    expect(labelFinish("sticker")).toEqual({ metalness: 0.02, roughness: 0.42, bumpScale: 16, envMapIntensity: 0.35, emissive: 0 });
    expect(labelFinish("engrave")).toEqual({ metalness: 0, roughness: 0.94, bumpScale: -14, envMapIntensity: 0.15, emissive: 0 });
  });

  it("pins foil roughness, an environment floor, and emissive in the ink colour", () => {
    const foil = labelFinish("plaque");
    expect(foil.roughness).toBeGreaterThan(0.05);
    expect(foil.roughness).toBeLessThanOrEqual(0.22);
    expect(foil.metalness).toBeGreaterThan(0.45);
    expect(foil.emissive).toBeGreaterThanOrEqual(1);
    expect(FOIL_ENV_FLOOR).toBeGreaterThan(0);
    expect(foil.envMapIntensity).toBeGreaterThanOrEqual(FOIL_ENV_FLOOR);
    expect(foil.emissive).toBeGreaterThan(0);
    expect(labelEmissive("#c9a36a", "plaque")).toBe("#c9a36a");
    expect(labelEmissive("#141414", "plaque")).toBe("#141414");
    expect(labelEmissive("#c9a36a", "sticker")).toBe("#000000");
    expect(labelEmissive("#c9a36a", "engrave")).toBe("#000000");
    expect(labelEmissive("#c9a36a", "decal")).toBe("#000000");
    expect(labelFinish("sticker").emissive).toBe(0);
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
    paintLabelEmissive(source, "#c9a36a", "plaque", target);
    const at = (x: number, y: number) => target[(y * width + x) * 4];
    expect(at(2, 2)).toBe(0);
    expect(at(16, 16)).toBe(255);
    paintLabelEmissive(source, "#c9a36a", "sticker", target);
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
    paintLabelSurface(source, "#D6B26A", "plaque", target, width, height);
    const platePixel = at(2, 2);
    const inkPixel = at(24, 24);
    expect(platePixel[0]).toBe(0);
    expect(platePixel[1]).toBe(255);
    expect(platePixel[2]).toBe(0);
    expect(inkPixel[0]).toBe(255);
    expect(inkPixel[1]).toBe(Math.round(labelFinish("plaque").roughness * 255));
    expect(inkPixel[2]).toBe(255);
    paintLabelSurface(source, "#D6B26A", "sticker", target, width, height);
    expect(at(24, 24)[0]).toBeGreaterThan(200);
    expect(at(2, 2)[0]).toBe(0);
    expect(contrastingPlate("#D6B26A")).toBe("#16130f");
  });

  it("gives a transparent margin no coverage, metal, or glow", () => {
    const source = new Uint8ClampedArray(8);
    source.set([0xd6, 0xb2, 0x6a, 0, 0xd6, 0xb2, 0x6a, 255]);
    const target = new Uint8ClampedArray(8);
    paintLabelSurface(source, "#D6B26A", "plaque", target, 2, 1);
    expect(target[0]).toBe(0);
    expect(target[2]).toBe(0);
    expect(target[6]).toBe(255);
    paintLabelEmissive(source, "#D6B26A", "plaque", target);
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
    relieveLabelPixels(foil, width, height, "plaque");
    relieveLabelPixels(engrave, width, height, "engrave");
    relieveLabelPixels(emboss, width, height, "sticker");
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
    expect(luma(rim)).toBeGreaterThan(150);
    expect(engrave[(6 * width + 8) * 4 + 3]).toBe(255);
    const grey = new Uint8ClampedArray(source);
    for (let i = 0; i < grey.length; i += 4) {
      if (grey[i + 3] === 0) continue;
      grey[i] = 160;
      grey[i + 1] = 154;
      grey[i + 2] = 146;
    }
    relieveLabelPixels(grey, width, height, "sticker");
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
    expect(foilBody[0]).toBeGreaterThan(foilBody[2] + 40);
    expect(foilBody[2]).toBeGreaterThan(140);
    const black = new Uint8ClampedArray(source);
    const rose = new Uint8ClampedArray(source);
    const silver = new Uint8ClampedArray(source);
    for (let i = 0; i < source.length; i += 4) {
      if (source[i + 3] === 0) continue;
      black[i] = 0;
      black[i + 1] = 0;
      black[i + 2] = 0;
      rose[i] = 183;
      rose[i + 1] = 110;
      rose[i + 2] = 121;
      silver[i] = 243;
      silver[i + 1] = 246;
      silver[i + 2] = 251;
    }
    relieveLabelPixels(black, width, height, "plaque");
    relieveLabelPixels(rose, width, height, "plaque");
    relieveLabelPixels(silver, width, height, "plaque");
    const blackBody = at(black, 20, 16);
    const roseBody = at(rose, 20, 16);
    expect(blackBody[0]).toBeLessThan(20);
    expect(blackBody[2]).toBeLessThan(20);
    const lifted = foilDisplayInk("#000000", "#000000");
    expect(contrastRatio("#000000", "#000000")).toBeLessThan(FOIL_CONTRAST_FLOOR);
    expect(relativeLuminance(lifted)).toBeGreaterThanOrEqual(FOIL_METAL_MIN - 0.001);
    expect(foilDisplayInk("#d4a017", "#000000")).toBe("#d4a017");
    expect(FOIL_LOW_METALNESS).toBeCloseTo(0.3, 5);
    const onBlack = new Uint8ClampedArray(source);
    for (let i = 0; i < onBlack.length; i += 4) {
      if (onBlack[i + 3] === 0) continue;
      onBlack[i] = 0;
      onBlack[i + 1] = 0;
      onBlack[i + 2] = 0;
    }
    relieveLabelPixels(onBlack, width, height, "plaque", { ink: "#000000", substrate: "#000000" });
    const liftedBody = at(onBlack, 20, 16);
    expect(luma(liftedBody)).toBeGreaterThan(40);
    expect(luma(liftedBody)).toBeLessThan(60);
    const foilRim = at(onBlack, 8, 6);
    expect(luma(foilRim)).toBeGreaterThan(luma(liftedBody) + 40);
    expect(luma(foilRim)).toBeLessThanOrEqual(130);
    expect(roseBody[0]).toBeGreaterThan(roseBody[2]);
    expect(roseBody[0]).toBeGreaterThan(roseBody[1]);
    expect(at(silver, 20, 16)[2]).toBeGreaterThan(at(silver, 20, 16)[0] - 15);
    const cream = new Uint8ClampedArray(source);
    for (let i = 0; i < cream.length; i += 4) {
      if (cream[i + 3] === 0) continue;
      cream[i] = 243;
      cream[i + 1] = 239;
      cream[i + 2] = 230;
    }
    relieveLabelPixels(cream, width, height, "sticker");
    let creamPeak = 0;
    for (let y = 6; y < 26; y += 1) {
      for (let x = 8; x < 30; x += 1) {
        const rgb = at(cream, x, y);
        creamPeak = Math.max(creamPeak, rgb[0], rgb[1], rgb[2]);
      }
    }
    expect(creamPeak).toBeGreaterThan(243);
    expect(creamPeak).toBeLessThanOrEqual(250);
    const outline = new Uint8ClampedArray(width * height * 4);
    const onOutline = (x: number, y: number) =>
      (x === 4 || x === 34 || y === 4 || y === 26) && x >= 4 && x <= 34 && y >= 4 && y <= 26;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!onOutline(x, y)) continue;
        const index = (y * width + x) * 4;
        outline[index] = 40;
        outline[index + 1] = 36;
        outline[index + 2] = 30;
        outline[index + 3] = 255;
      }
    }
    relieveLabelPixels(outline, width, height, "engrave");
    let frostPixels = 0;
    let darkPixels = 0;
    let stroked = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!onOutline(x, y)) continue;
        stroked += 1;
        const rgb = at(outline, x, y);
        if (luma(rgb) > 140) frostPixels += 1;
        if (luma(rgb) < 50) darkPixels += 1;
      }
    }
    expect(stroked).toBeGreaterThan(40);
    expect(frostPixels).toBe(stroked);
    expect(darkPixels).toBe(0);
  });

  it("repaints only when a new face loads", () => {
    expect(shouldRepaintLabel(true)).toBe(false);
    expect(shouldRepaintLabel(false)).toBe(true);
  });

  it("keeps the carton plaque clear unless print has a plate colour", () => {
    const painted = (application: "plaque" | "sticker" | "engrave" | "decal", colour: string | null) => {
      const ctx = fakeCtx();
      paintCartonMark(ctx as unknown as CanvasRenderingContext2D, { font: "cinzel" }, "ATELIER", "#c9a36a", 640, 180, application, colour);
      return ctx.plate === "" ? "clear" : ctx.plate;
    };
    expect(painted("plaque", "#111111")).toBe(cartonMarkPlate("plaque", "#111111"));
    expect(painted("sticker", "#111111")).toBe("clear");
    expect(painted("sticker", "#111111")).toBe(cartonMarkPlate("sticker", "#111111"));
    expect(painted("sticker", "  ")).toBe(cartonMarkPlate("sticker", "  "));
    expect(painted("engrave", "#111111")).toBe(cartonMarkPlate("engrave", "#111111"));
    expect(cartonMarkPlate("decal", null)).toBe("clear");
    expect(painted("decal", "  ")).toBe("clear");
    expect(cartonMarkPlate("print", "")).toBe("clear");
    expect(cartonMarkPlate("print", "#f4efe6")).toBe("#f4efe6");
    expect(painted("decal", "#f4efe6")).toBe("#f4efe6");
    expect(painted("decal", "#f4efe6")).toBe(cartonMarkPlate("decal", "#f4efe6"));
    const emboss = fakeCtx();
    paintCartonMark(emboss as unknown as CanvasRenderingContext2D, { font: "cinzel" }, "ATELIER", "#c9a36a", 640, 180, "sticker");
    expect(emboss.strokes.length).toBeGreaterThan(0);
    expect(Math.min(...emboss.strokes)).toBeGreaterThanOrEqual(hairlineWidth(1, 0, "sticker"));
  });

  it("paints carton foil and engrave on a clear ground, and keeps a plate only for print", () => {
    const foil = fakeCtx();
    paintCartonMark(foil as unknown as CanvasRenderingContext2D, { font: "cinzel" }, "ATELIER", "#c9a36a", 640, 180, "plaque");
    expect(foil.plate).toBe("");
    expect(foil.cleared).toBe(true);
    expect(foil.texts.filter((call) => call.text === "ATELIER")).toHaveLength(1);
    expect(foil.texts[0]?.fill).toBe("#c9a36a");
    const engrave = fakeCtx();
    paintCartonMark(engrave as unknown as CanvasRenderingContext2D, { font: "cormorant" }, "ATELIER", "#c9a36a", 640, 180, "engrave");
    expect(engrave.plate).toBe("");
    const emboss = fakeCtx();
    paintCartonMark(emboss as unknown as CanvasRenderingContext2D, { font: "cinzel" }, "ATELIER", "#c9a36a", 640, 180, "sticker");
    expect(emboss.plate).toBe("");
    const platePixels = new Uint8ClampedArray([10, 20, 30, 0, 40, 50, 60, 255]);
    compositeEmbossPlatePixels(platePixels, [22, 19, 15]);
    expect(Array.from(platePixels.slice(0, 4))).toEqual([22, 19, 15, 255]);
    expect(Array.from(platePixels.slice(4, 8))).toEqual([40, 50, 60, 255]);
    expect(hairlineWidth(80, 0.012, "decal")).toBeCloseTo(1, 5);
    expect(hairlineWidth(80, 0.012, "engrave")).toBe(2);
    expect(hairlineWidth(80, 0.012, "sticker")).toBe(2);
    expect(hairlineWidth(80, 0.012, "plaque")).toBe(2);
    expect(hairlineWidth(400, 0.012, "plaque")).toBeCloseTo(4.8, 5);
    expect(engraveAlpha(255)).toBe(255);
    expect(engraveAlpha(0)).toBe(0);
    expect(engraveAlpha(40)).toBeLessThan(80);
    expect(engraveAlpha(255)).toBeGreaterThan(0.35 * 255);
    const print = fakeCtx();
    paintCartonMark(print as unknown as CanvasRenderingContext2D, { font: "cinzel" }, "ATELIER", "#c9a36a", 640, 180, "decal");
    expect(print.plate).toBe("#16130f");
    expect(print.strokes).toHaveLength(0);
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
    lineJoin: "miter",
    plate: "",
    cleared: false,
    texts,
    strokes: [] as number[],
    clearRect() {
      ctx.cleared = true;
    },
    fillRect() {
      if (!ctx.plate) ctx.plate = String(ctx.fillStyle);
    },
    fillText(text: string) {
      texts.push({ text, direction: ctx.direction, font: ctx.font, fill: String(ctx.fillStyle) });
    },
    strokeText() {
      ctx.strokes.push(ctx.lineWidth);
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
