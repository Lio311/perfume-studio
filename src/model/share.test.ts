import { describe, expect, it, afterEach } from "vitest";
import { setImportedCatalog } from "./catalog.ts";
import { createDefaultDesign } from "./design.ts";
import { computeFit } from "./fit.ts";
import { applyIncomingShareHash, applyShareHash, decodeShareDesign, encodeShareDesign, invalidShareMessage, mergeShareDesign, missingPartsMessage, respondToLocation } from "./share.ts";
import type { BottleSpec, LogoSpec } from "./types.ts";

describe("share links", () => {
  afterEach(() => {
    setImportedCatalog({ bottles: [], caps: [], labels: [], pumps: [], collars: [], boxes: [] });
  });

  it("round-trips a design, including Hebrew label text", () => {
    const design = createDefaultDesign();
    design.label.text = "אור נואר";
    design.step = 3;
    const decoded = decodeShareDesign(encodeShareDesign(design));
    expect(decoded).toEqual(design);
  });

  it("fills liquid and label when an older payload omits them", () => {
    const defaults = createDefaultDesign();
    const decoded = mergeShareDesign({
      bottle: { variantId: "diamond-50", visible: true },
      cap: { visible: true },
    });
    expect(decoded).not.toBeNull();
    expect(decoded?.bottle.variantId).toBe("diamond-50");
    expect(decoded?.bottle.visible).toBe(true);
    expect(decoded?.bottle.heightMm).toBe(defaults.bottle.heightMm);
    expect(decoded?.cap.visible).toBe(true);
    expect(decoded?.cap.variantId).toBe(defaults.cap.variantId);
    expect(decoded?.liquid).toEqual(defaults.liquid);
    expect(decoded?.label).toEqual(defaults.label);
    expect(decoded?.pump).toEqual(defaults.pump);
    expect(decoded?.collar).toEqual(defaults.collar);
    expect(decoded?.box).toEqual(defaults.box);
    expect(decoded?.step).toBeUndefined();
    expect(decoded?.liquid.fill).toBeTypeOf("number");
    expect(decoded?.label.text).toBeTypeOf("string");
  });

  it("keeps valid partial fields and drops mistyped ones", () => {
    const defaults = createDefaultDesign();
    const decoded = mergeShareDesign({
      bottle: {},
      liquid: "nope",
      label: { text: "אור", scale: "big", visible: true },
      step: Number.NaN,
    });
    expect(decoded?.liquid).toEqual(defaults.liquid);
    expect(decoded?.label.text).toBe("אור");
    expect(decoded?.label.scale).toBe(defaults.label.scale);
    expect(decoded?.label.visible).toBe(true);
    expect(decoded?.label.variantId).toBe(defaults.label.variantId);
    expect(decoded?.step).toBeUndefined();
  });

  it("returns null for malformed hashes and non-design payloads", () => {
    expect(decodeShareDesign("%%%")).toBeNull();
    expect(decodeShareDesign("not base64")).toBeNull();
    expect(mergeShareDesign(null)).toBeNull();
    expect(mergeShareDesign([])).toBeNull();
    expect(mergeShareDesign("bottle")).toBeNull();
    expect(mergeShareDesign({ foo: 1 })).toBeNull();
    const junk = btoa(unescape(encodeURIComponent("[]"))).replace(/=+$/g, "");
    expect(decodeShareDesign(junk)).toBeNull();
  });

  it("drops prototype keys and does not pollute Object", () => {
    const marker = "__share_polluted__";
    const payload = JSON.parse(
      `{"bottle":{"neck":"FEA15","__proto__":{"${marker}":true}},"__proto__":{"${marker}":true},"constructor":{"prototype":{"${marker}":true}}}`,
    ) as object;
    const decoded = mergeShareDesign(payload);
    expect(({} as Record<string, unknown>)[marker]).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>)[marker]).toBeUndefined();
    expect(decoded?.bottle.neck).toBe("FEA15");
    expect(decoded && Object.prototype.hasOwnProperty.call(decoded, "__proto__")).toBe(false);
    expect(decoded && Object.prototype.hasOwnProperty.call(decoded, "constructor")).toBe(false);
    expect(decoded && Object.prototype.hasOwnProperty.call(decoded.bottle, marker)).toBe(false);
  });

  it("rejects an unknown neck, finish, colour, and part id", () => {
    const defaults = createDefaultDesign();
    const decoded = mergeShareDesign({
      bottle: { neck: "FEA99", finish: "chrome", color: "red", variantId: "no-such-bottle" },
      liquid: { color: "#abc" },
      cap: { variantId: "no-such-cap" },
    });
    expect(decoded?.bottle.neck).toBe(defaults.bottle.neck);
    expect(decoded?.bottle.finish).toBe(defaults.bottle.finish);
    expect(decoded?.bottle.color).toBe(defaults.bottle.color);
    expect(decoded?.bottle.variantId).toBe(defaults.bottle.variantId);
    expect(decoded?.liquid.color).toBe(defaults.liquid.color);
    expect(decoded?.cap.variantId).toBe(defaults.cap.variantId);
  });

  it("migrates an old share colour and keeps a versioned ink", () => {
    const legacy = mergeShareDesign({
      label: { variantId: "lg-heebo-word", color: "#141414", text: "NOIR", visible: true },
    });
    expect(legacy?.label.color).toBe("#f4eee4");

    const current = mergeShareDesign({
      version: 6,
      label: { variantId: "lg-heebo-word", color: "#c9a36a", text: "NOIR", visible: true },
    });
    expect(current?.label.color).toBe("#c9a36a");

    const engraved: LogoSpec = {
      id: "supplier-engrave",
      name: { he: "ספק", en: "Supplier" },
      plate: "plaque",
      mark: "word",
      application: "engrave",
      font: "heebo",
      frame: "none",
      tags: ["imported"],
      model: { type: "procedural" },
    };
    setImportedCatalog({ bottles: [], caps: [], labels: [engraved], pumps: [], collars: [], boxes: [] });
    const imported = mergeShareDesign({
      label: { variantId: "supplier-engrave", color: "#141414", text: "NOIR", visible: true },
    });
    expect(imported?.label.variantId).toBe("supplier-engrave");
    expect(imported?.label.color).toBe("#0c0b0a");
  });

  it("keeps an imported supplier part id", () => {
    setImportedCatalog({
      bottles: [{
        id: "supplier-flask",
        name: { he: "ספק", en: "Supplier" },
        section: "rect",
        profile: "cara",
        shoulder: 0.2,
        heightMm: 80,
        widthMm: 40,
        depthMm: 30,
        neck: "FEA15",
        softness: 0,
        faceted: false,
        tags: ["imported"],
        model: { type: "procedural" },
        capacityMl: 50,
      } satisfies BottleSpec],
      caps: [],
      labels: [],
      pumps: [],
      collars: [],
      boxes: [],
    });
    expect(mergeShareDesign({ bottle: { variantId: "supplier-flask" } })?.bottle.variantId).toBe("supplier-flask");
  });

  it("clamps out-of-range numbers and limits label text", () => {
    const decoded = mergeShareDesign({
      bottle: { heightMm: 999, widthMm: 1, depthMm: 10, opacity: 4 },
      cap: { heightMm: 0, widthMm: 90 },
      box: { heightMm: 10, widthMm: 400, depthMm: 500 },
      label: { scale: 9, text: "x".repeat(40) },
      liquid: { fill: 4 },
    });
    expect(decoded?.bottle.heightMm).toBe(180);
    expect(decoded?.bottle.widthMm).toBe(26);
    expect(decoded?.bottle.depthMm).toBe(20);
    expect(decoded?.bottle.opacity).toBe(1);
    expect(decoded?.cap.heightMm).toBe(10);
    expect(decoded?.cap.widthMm).toBe(48);
    expect(decoded?.box.heightMm).toBe(70);
    expect(decoded?.box.widthMm).toBe(160);
    expect(decoded?.box.depthMm).toBe(140);
    expect(decoded?.label.scale).toBe(1.6);
    expect(decoded?.label.text).toHaveLength(32);
    expect(decoded?.liquid.fill).toBe(1);
    expect(mergeShareDesign({ liquid: { fill: 0 } })?.liquid.fill).toBe(0);
    expect(mergeShareDesign({ liquid: { fill: 1 } })?.liquid.fill).toBe(1);
  });

  it("rejects prototype neck names instead of storing them", () => {
    const defaults = createDefaultDesign();
    const decoded = mergeShareDesign({ bottle: { neck: "constructor" } });
    expect(decoded?.bottle.neck).toBe(defaults.bottle.neck);
    expect(mergeShareDesign({ bottle: { neck: "toString" } })?.bottle.neck).toBe(defaults.bottle.neck);
    expect(() => {
      if (decoded) computeFit(decoded);
    }).not.toThrow();
  });

  it("accepts an integer step from 0 to 7 and leaves an invalid step unset", () => {
    expect(mergeShareDesign({ bottle: {}, step: 4 })?.step).toBe(4);
    expect(mergeShareDesign({ bottle: {}, step: 0 })?.step).toBe(0);
    expect(mergeShareDesign({ bottle: {}, step: 7 })?.step).toBe(7);
    expect(mergeShareDesign({ bottle: {}, step: 8 })?.step).toBeUndefined();
    expect(mergeShareDesign({ bottle: {}, step: -1 })?.step).toBeUndefined();
    expect(mergeShareDesign({ bottle: {}, step: 1.5 })?.step).toBeUndefined();
    expect(mergeShareDesign({ bottle: {} })?.step).toBeUndefined();
  });

  it("drops unknown keys", () => {
    const decoded = mergeShareDesign({ bottle: { variantId: "cara-50", extra: "no" }, surprise: true });
    expect(decoded && "extra" in decoded.bottle).toBe(false);
    expect(decoded && "surprise" in (decoded as object)).toBe(false);
  });

  it("clears the hash after apply and keeps the current history state", () => {
    const calls: Array<{ state: unknown; url: string }> = [];
    let applied = false;
    const state = { lab: 1 };
    applyShareHash({
      hash: `#d=${encodeShareDesign(createDefaultDesign())}`,
      pathname: "/lab",
      search: "?voice=1",
      state,
      apply: () => {
        applied = true;
      },
      replaceState: (next, _title, url) => calls.push({ state: next, url }),
    });
    expect(applied).toBe(true);
    expect(calls).toEqual([{ state, url: "/lab?voice=1" }]);
  });

  it("waits for async supplier packs before applying a share hash", async () => {
    const flask = {
      id: "supplier-flask",
      name: { he: "ספק", en: "Supplier" },
      section: "rect",
      profile: "cara",
      shoulder: 0.2,
      heightMm: 80,
      widthMm: 40,
      depthMm: 30,
      neck: "FEA15",
      softness: 0,
      faceted: false,
      tags: ["imported"],
      model: { type: "procedural" },
      capacityMl: 50,
    } satisfies BottleSpec;
    let release: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen: string[] = [];
    const missing: string[][] = [];
    const design = createDefaultDesign();
    design.bottle.variantId = "supplier-flask";
    const hash = `#d=${encodeShareDesign(design)}`;
    const anchor = createDefaultDesign();
    const pending = applyIncomingShareHash({
      read: () => ({ hash, pathname: "/lab", search: "", state: { lab: 1 } }),
      ready,
      baseline: () => anchor,
      apply: (next) => seen.push(next.bottle.variantId),
      noteMissing: (ids) => missing.push(ids),
      replaceState: () => undefined,
    });
    // Let the early malformed check run. Packs are still unloaded, so the link must not be applied yet.
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seen).toEqual([]);
    setImportedCatalog({ bottles: [flask], caps: [], labels: [], pumps: [], collars: [], boxes: [] });
    release();
    await pending;
    expect(seen).toEqual(["supplier-flask"]);
    expect(missing).toEqual([]);
    setImportedCatalog({ bottles: [], caps: [], labels: [], pumps: [], collars: [], boxes: [] });
  });

  it("applies a share hash when packs do not load in time and notes the missing part", async () => {
    const stable = createDefaultDesign();
    const linked = createDefaultDesign();
    linked.bottle.variantId = "supplier-flask";
    const seen: string[] = [];
    const missing: string[][] = [];
    await applyIncomingShareHash({
      read: () => ({ hash: `#d=${encodeShareDesign(linked)}`, pathname: "/", search: "", state: null }),
      ready: new Promise(() => undefined),
      hydrated: Promise.resolve(),
      timeoutMs: 30,
      baseline: () => stable,
      apply: (design) => seen.push(design.bottle.variantId),
      noteMissing: (ids) => missing.push(ids),
      replaceState: () => undefined,
    });
    expect(seen).toEqual([stable.bottle.variantId]);
    expect(missing[0]).toContain("supplier-flask");
  });

  it("skips a share hash when the design changes while packs are loading", async () => {
    let current = createDefaultDesign();
    let applied = false;
    let cleared = "";
    let releaseHydrated: () => void = () => undefined;
    const hydrated = new Promise<void>((resolve) => {
      releaseHydrated = resolve;
    });
    const pending = applyIncomingShareHash({
      read: () => ({ hash: `#d=${encodeShareDesign(createDefaultDesign())}`, pathname: "/lab", search: "", state: { lab: 1 } }),
      ready: new Promise(() => undefined),
      hydrated,
      timeoutMs: 40,
      baseline: () => current,
      apply: () => {
        applied = true;
      },
      replaceState: (_state, _title, url) => {
        cleared = url;
      },
    });
    releaseHydrated();
    await new Promise((resolve) => setTimeout(resolve, 0));
    current = { ...current, label: { ...current.label, text: "edited" } };
    await pending;
    expect(applied).toBe(false);
    expect(cleared).toBe("/lab");
  });

  it("applies a pasted #d= hash and does not treat it as Back", async () => {
    const calls: string[] = [];
    await respondToLocation({
      kind: "hash",
      hash: "#d=abc",
      applyShare: async () => {
        calls.push("share");
        return true;
      },
      back: () => calls.push("back"),
    });
    await respondToLocation({
      kind: "pop",
      hash: "#d=abc",
      applyShare: async () => {
        calls.push("share");
        return true;
      },
      back: () => calls.push("back"),
    });
    await respondToLocation({
      kind: "hash",
      hash: "",
      applyShare: async () => {
        calls.push("share");
        return false;
      },
      back: () => calls.push("back"),
    });
    await respondToLocation({
      kind: "pop",
      hash: "",
      applyShare: async () => {
        calls.push("share");
        return false;
      },
      back: () => calls.push("back"),
    });
    expect(calls).toEqual(["share", "share", "back"]);
  });

  it("rejects a garbage share hash, keeps the saved design, and clears the hash", () => {
    const calls: string[] = [];
    let applied = false;
    const state = { lab: 1, step: 2 };
    const ok = applyShareHash({
      hash: "#d=garbage%%%123",
      pathname: "/lab",
      search: "?voice=1",
      state,
      apply: () => {
        applied = true;
      },
      replaceState: (next, _title, url) => calls.push(`${JSON.stringify(next)} ${url}`),
      noteInvalid: () => calls.push("invalid"),
    });
    expect(ok).toBe(false);
    expect(applied).toBe(false);
    expect(calls).toEqual([`${JSON.stringify(state)} /lab?voice=1`, "invalid"]);
    expect(invalidShareMessage("he")).toBe("הקישור לא תקין, נטען העיצוב האחרון");
    expect(invalidShareMessage("en")).toBe("This link is invalid, your last design was loaded");
    expect(missingPartsMessage("he", ["cara-50", "pump-1"])).toBe("חלקים מהקישור לא נמצאו: \u2068cara-50\u2069, \u2068pump-1\u2069");
    expect(missingPartsMessage("en", ["cara-50"])).toBe("Parts from the link were not found: \u2068cara-50\u2069");
  });

  it("rejects a valid share hash truncated by 10 characters", () => {
    const encoded = encodeShareDesign(createDefaultDesign());
    expect(encoded.length).toBeGreaterThan(10);
    const calls: string[] = [];
    let applied = false;
    const ok = applyShareHash({
      hash: `#d=${encoded.slice(0, -10)}`,
      pathname: "/",
      search: "",
      state: null,
      apply: () => {
        applied = true;
      },
      replaceState: (_state, _title, url) => calls.push(url),
      noteInvalid: () => calls.push("invalid"),
    });
    expect(ok).toBe(false);
    expect(applied).toBe(false);
    expect(decodeShareDesign(encoded.slice(0, -10))).toBeNull();
    expect(calls).toEqual(["/", "invalid"]);
  });

  it("clears a garbage hash before waiting for supplier packs", async () => {
    let applied = false;
    let invalid = false;
    let cleared = "";
    const started = Date.now();
    await applyIncomingShareHash({
      read: () => ({ hash: "#d=garbage%%%123", pathname: "/lab", search: "", state: { lab: 1 } }),
      ready: new Promise(() => undefined),
      hydrated: Promise.resolve(),
      timeoutMs: 5000,
      baseline: () => createDefaultDesign(),
      apply: () => {
        applied = true;
      },
      noteInvalid: () => {
        invalid = true;
      },
      replaceState: (_state, _title, url) => {
        cleared = url;
      },
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(applied).toBe(false);
    expect(invalid).toBe(true);
    expect(cleared).toBe("/lab");
  });

  it("decodes a hash that is missing padding", () => {
    const design = createDefaultDesign();
    design.liquid = { color: "#112233", fill: 0.4, visible: true };
    const hash = encodeShareDesign(design);
    expect(hash.endsWith("=")).toBe(false);
    expect(decodeShareDesign(hash)?.liquid).toEqual(design.liquid);
  });
});
