import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrateBox } from "../model/boxFields.ts";
import { setImportedCatalog } from "../model/catalog.ts";
import { createDefaultDesign } from "../model/design.ts";
import type { Design, LogoSpec } from "../model/types.ts";
import { createLabStorage, DEFAULT_BUDGET_BRIEF, mergePersistedLab, migratePersisted, partializeLabState, readStorageValue, resetPersistedPayload, resumeLabStorageWrites, sanitizeDesign, type HydratedSlice } from "./hydrate.ts";
import { useLab } from "./labStore.ts";

function slice(design: Design = createDefaultDesign()): HydratedSlice {
  return {
    design,
    theme: "dark",
    lang: "he",
    chat: [],
    saved: [],
    pending: [],
    compareIds: ["seed-atelier"],
    past: [],
    future: [],
  };
}

describe("saved design hydration", () => {
  it("starts a cleared store on a visible Cara 50", () => {
    const fresh = createDefaultDesign();
    expect(fresh.bottle.variantId).toBe("cara-50");
    expect(fresh.bottle.visible).toBe(true);
    expect(fresh.bottle.heightMm).toBeGreaterThan(0);
    expect(fresh.bottle.widthMm).toBeGreaterThan(0);
    expect(fresh.bottle.depthMm).toBeGreaterThan(0);

    const cleared = mergePersistedLab(undefined, slice());
    expect(cleared.design.bottle).toEqual(fresh.bottle);

    const hiddenSlot = mergePersistedLab({ design: { bottle: { visible: false }, cap: {} } }, slice());
    expect(hiddenSlot.design.bottle).toEqual(fresh.bottle);
    expect(hiddenSlot.design.bottle.visible).toBe(true);
  });

  it("keeps a full default when the stored state is {}", () => {
    const current = slice();
    const merged = mergePersistedLab({}, current);
    expect(merged.design).toEqual(current.design);
    expect(merged.design.bottle.variantId).toBe("cara-50");
    expect(merged.design.bottle.visible).toBe(true);
    expect(merged.design.pump.variantId).toBe("pump-crimp");
    expect(merged.design.collar.variantId).toBe("col-crimp");
    expect(merged.design.label.variantId).toBe("lg-foil-diamond");
    expect(merged.design.box.variantId).toBe("box-rigid");
  });

  it("fills a partial design and an empty design from defaults", () => {
    const current = slice();
    const empty = mergePersistedLab({ design: {} }, current);
    const fresh = createDefaultDesign();
    delete fresh.step;
    expect(empty.design).toEqual(fresh);
    expect(empty.design.step).toBeUndefined();

    const partial = mergePersistedLab({ design: { bottle: {}, cap: {} } }, current);
    expect(partial.design.bottle).toEqual(createDefaultDesign().bottle);
    expect(partial.design.cap).toEqual(createDefaultDesign().cap);
    expect(partial.design.pump).toEqual(createDefaultDesign().pump);
    expect(partial.design.collar).toEqual(createDefaultDesign().collar);
    expect(partial.design.label).toEqual(createDefaultDesign().label);
    expect(partial.design.box).toEqual(createDefaultDesign().box);
    expect(partial.design.liquid).toEqual(createDefaultDesign().liquid);
    expect(() => partial.design.pump.variantId).not.toThrow();
  });

  it("drops garbage fields and keeps a known variant", () => {
    const merged = mergePersistedLab(
      {
        design: {
          bottle: { variantId: "cara-50", heightMm: "tall", visible: "yes", finish: "chrome", extra: true },
          label: { variantId: "lg-foil-diamond", text: "x".repeat(40), scale: 9 },
          liquid: { color: "amber", fill: -4, visible: 1 },
          surprise: 1,
        },
        theme: "neon",
        lang: 3,
        chat: [{ id: "", role: "user" }, { id: "m1", role: "nope" }, { id: "m2", role: "lab", text: "שלום", snapshot: { bottle: {} } }],
        past: [null, 4, { bottle: { variantId: "not-real" } }],
        saved: { id: "bad" },
        compareIds: "seed-atelier",
      },
      slice(),
    );
    const defaults = createDefaultDesign();
    delete defaults.step;
    expect(merged.design.bottle.variantId).toBe("cara-50");
    expect(merged.design.bottle.heightMm).toBe(defaults.bottle.heightMm);
    expect(merged.design.bottle.visible).toBe(true);
    expect(merged.design.bottle.finish).toBe("clear");
    expect("extra" in merged.design.bottle).toBe(false);
    expect("surprise" in merged.design).toBe(false);
    expect(merged.design.label.text).toHaveLength(32);
    expect(merged.design.label.scale).toBe(1.6);
    expect(merged.design.liquid.color).toBe(defaults.liquid.color);
    expect(merged.design.liquid.fill).toBe(0);
    expect(merged.design.liquid.visible).toBe(defaults.liquid.visible);
    expect(merged.theme).toBe("dark");
    expect(merged.lang).toBe("he");
    expect(merged.chat).toEqual([
      { id: "m2", role: "lab", text: "שלום", snapshot: defaults },
    ]);
    expect(merged.past).toEqual([defaults]);
    expect(merged.saved).toEqual([]);
    expect(merged.compareIds).toEqual(["seed-atelier"]);
  });

  it("replaces an incomplete unknown bottle and fills a known cap from its own spec", () => {
    const merged = mergePersistedLab(
      {
        design: {
          bottle: { variantId: "no-such-bottle", heightMm: 90, visible: true },
          cap: { variantId: "cap-crystal", finish: "silver" },
        },
      },
      slice(),
    );
    expect(merged.design.bottle).toEqual(createDefaultDesign().bottle);
    expect(merged.design.cap.variantId).toBe("cap-crystal");
    expect(merged.design.cap.finish).toBe("silver");
    expect(merged.design.cap.heightMm).toBe(34);
    expect(merged.design.cap.widthMm).toBe(26);
  });

  it("ignores invalid JSON", () => {
    expect(readStorageValue("{")).toBeNull();
    expect(readStorageValue("not json")).toBeNull();
    expect(readStorageValue("")).toBeNull();
    expect(readStorageValue(null)).toBeNull();
    expect(readStorageValue("[]")).toBeNull();
    expect(mergePersistedLab(undefined, slice()).design.bottle.variantId).toBe("cara-50");
  });

  it("leaves a valid full design unchanged", () => {
    const design = createDefaultDesign();
    design.bottle = { ...design.bottle, variantId: "diamond-50", heightMm: 90, visible: true, neck: "FEA15" };
    design.cap = { ...design.cap, variantId: "cap-crystal", finish: "silver", color: "#d5d8de", visible: true };
    design.label = { ...design.label, text: "ATELIER", scale: 1.2, visible: true };
    design.pump = { ...design.pump, visible: true };
    design.collar = { ...design.collar, visible: false };
    design.box = { ...design.box, linked: false, widthMm: 90, visible: true };
    design.liquid = { ...design.liquid, fill: 0.4, visible: true };
    design.step = 7;
    const saved = {
      id: "cfg-1",
      name: "נואר",
      design,
      thumb: "",
      createdAt: 12,
    };
    const current = slice();
    const merged = mergePersistedLab(
      {
        design,
        theme: "light",
        lang: "en",
        chat: [{ id: "c1", role: "user", text: "פקק הבא" }],
        saved: [saved],
        pending: [{ id: "p1", name: "photo", category: "cap", files: [{ name: "a.png", type: "image/png", size: 12 }], createdAt: 3 }],
        compareIds: ["cfg-1", "cfg-1", "seed-atelier"],
        past: [createDefaultDesign()],
        future: [],
      },
      current,
    );
    expect(merged.design).toEqual(design);
    expect(merged.theme).toBe("light");
    expect(merged.lang).toBe("en");
    expect(merged.chat).toEqual([{ id: "c1", role: "user", text: "פקק הבא" }]);
    expect(merged.saved).toEqual([saved]);
    expect(merged.pending[0]?.files[0]?.name).toBe("a.png");
    expect(merged.compareIds).toEqual(["cfg-1", "seed-atelier"]);
    expect(merged.past).toEqual([createDefaultDesign()]);
    expect(merged.future).toEqual([]);
    expect(sanitizeDesign(design)).toEqual(design);
  });

  it("hydrates the exact stale perfume-lab-v1 blob into a full design", () => {
    const raw = JSON.stringify({ design: { bottle: {}, cap: {} } });
    const parsed = readStorageValue(raw);
    expect(parsed).toEqual({ state: { design: { bottle: {}, cap: {} } } });
    const merged = mergePersistedLab(parsed?.state, slice());
    const defaults = createDefaultDesign();
    delete defaults.step;
    expect(merged.design).toEqual(defaults);
    const ids = [merged.design.bottle, merged.design.cap, merged.design.pump, merged.design.collar, merged.design.label, merged.design.box].map((part) => part.variantId);
    expect(ids).toEqual(["cara-50", "cap-cube-tall", "pump-crimp", "col-crimp", "lg-foil-diamond", "box-rigid"]);

    const wrapped = readStorageValue(JSON.stringify({ state: { design: { bottle: {}, cap: {} } }, version: 4 }));
    expect(mergePersistedLab(wrapped?.state, slice()).design).toEqual(defaults);
  });

  it("keeps valid parts exactly and replaces only missing or invalid slots", () => {
    const defaults = createDefaultDesign();
    const bottle = {
      variantId: "diamond-50",
      neck: "FEA18" as const,
      finish: "tinted" as const,
      color: "#112233",
      heightMm: 90,
      widthMm: 40,
      depthMm: 36,
      opacity: 0.42,
      visible: true,
    };
    const label = {
      variantId: defaults.label.variantId,
      finish: defaults.label.finish,
      color: "#abcdef",
      text: "ATELIER",
      scale: 1.15,
      visible: true,
    };
    const merged = mergePersistedLab(
      {
        design: {
          bottle,
          cap: {},
          label,
          pump: { variantId: "missing-pump", visible: true },
        },
      },
      slice(),
    );
    expect(merged.design.bottle).toEqual(bottle);
    expect(merged.design.label).toEqual(label);
    expect(merged.design.cap).toEqual(defaults.cap);
    expect(merged.design.pump.variantId).toBe("missing-pump");
    expect(merged.design.pump.visible).toBe(true);
    expect(merged.design.pump.finish).toBe(defaults.pump.finish);
    expect(merged.design.collar).toEqual(defaults.collar);
    expect(merged.design.box).toEqual(defaults.box);
    expect(merged.design.liquid).toEqual(defaults.liquid);
    expect(sanitizeDesign({ bottle, cap: {}, label }).bottle).toEqual(bottle);
  });

  it("keeps glass opacity and saved sketches from the latest main fields", () => {
    const design = createDefaultDesign();
    design.bottle = { ...design.bottle, finish: "tinted", color: "#8d9a84", opacity: 0.2, visible: true };
    design.liquid = { ...design.liquid, visible: true };
    const saved = { id: "cfg-glass", name: "זכוכית", design, thumb: "", createdAt: 9 };
    const merged = mergePersistedLab({ design, saved: [saved], modal: "save" }, slice());
    expect(merged.design.bottle).toEqual(design.bottle);
    expect(merged.design.liquid).toEqual(design.liquid);
    expect(merged.saved).toEqual([saved]);
    expect("modal" in merged).toBe(false);

    const dropped = mergePersistedLab(
      { design: { bottle: { variantId: "cara-50", opacity: "solid" }, cap: {} } },
      slice(),
    );
    expect(dropped.design.bottle).toEqual(createDefaultDesign().bottle);
    expect(dropped.design.bottle.opacity).toBeUndefined();
  });

  it("finishes hydration for a share link, including a partial or unreadable blob", async () => {
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
      key: (index: number) => [...memory.keys()][index] ?? null,
      get length() {
        return memory.size;
      },
    });
    memory.set("perfume-lab-v1", JSON.stringify({ design: { bottle: {}, cap: {} } }));

    const finished: boolean[] = [];
    const unsub = useLab.persist.onFinishHydration(() => {
      finished.push(useLab.persist.hasHydrated());
    });
    const before = finished.length;
    await useLab.persist.rehydrate();
    expect(useLab.persist.hasHydrated()).toBe(true);
    expect(finished.length).toBe(before + 1);
    expect(finished.at(-1)).toBe(true);
    expect(useLab.getState().design.pump.variantId).toBe("pump-crimp");
    expect(useLab.getState().design.bottle.variantId).toBe("cara-50");

    const waitForShare = () => new Promise<void>((resolve) => {
      if (useLab.persist.hasHydrated()) {
        resolve();
        return;
      }
      const stop = useLab.persist.onFinishHydration(() => {
        stop();
        resolve();
      });
    });
    await waitForShare();

    memory.set("perfume-lab-v1", "{");
    await useLab.persist.rehydrate();
    expect(useLab.persist.hasHydrated()).toBe(true);
    expect(finished.length).toBe(before + 2);
    expect(finished.at(-1)).toBe(true);
    const fresh = createDefaultDesign();
    delete fresh.step;
    expect(useLab.getState().design).toEqual(fresh);
    unsub();
  });

  it("keeps a well-formed imported id through hydration and a second load", async () => {
    const importedBottle = {
      variantId: "pack-bouteille-12",
      neck: "FEA15" as const,
      finish: "clear" as const,
      color: "#445566",
      heightMm: 88,
      widthMm: 42,
      depthMm: 28,
      visible: true,
    };
    const savedDesign = createDefaultDesign();
    savedDesign.bottle = importedBottle;
    savedDesign.pump = { ...savedDesign.pump, variantId: "pack-pump-3", visible: true };
    const saved = { id: "cfg-pack", name: "ספק", design: savedDesign, thumb: "", createdAt: 8 };
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
      key: (index: number) => [...memory.keys()][index] ?? null,
      get length() {
        return memory.size;
      },
    });
    memory.set("perfume-lab-v1", JSON.stringify({
      state: {
        design: { bottle: importedBottle, pump: savedDesign.pump },
        saved: [saved],
        past: [{ bottle: importedBottle }],
      },
      version: 4,
    }));
    await useLab.persist.rehydrate();
    expect(useLab.getState().design.bottle).toEqual(importedBottle);
    expect(useLab.getState().design.pump.variantId).toBe("pack-pump-3");
    expect(useLab.getState().saved[0]?.design.bottle.variantId).toBe("pack-bouteille-12");
    const written = JSON.parse(memory.get("perfume-lab-v1") ?? "{}") as { state: { design: { bottle: { variantId: string } } }; version: number };
    expect(written.version).toBe(6);
    expect(written.state.design.bottle.variantId).toBe("pack-bouteille-12");
    await useLab.persist.rehydrate();
    expect(useLab.getState().design.bottle.variantId).toBe("pack-bouteille-12");
    expect(useLab.getState().saved[0]?.design.pump.variantId).toBe("pack-pump-3");
  });

  it("shows the untouched Cara 50 from a version 4 blob", () => {
    const hidden = migratePersisted({
      design: { bottle: { variantId: "cara-50", visible: false }, step: 0 },
    }, 4) as { design: { bottle: { visible: boolean } } };
    expect(hidden.design.bottle.visible).toBe(true);

    const missingStep = migratePersisted({
      design: { bottle: { variantId: "cara-50", visible: false } },
    }, 4) as { design: { bottle: { visible: boolean } } };
    expect(missingStep.design.bottle.visible).toBe(true);

    const chosen = migratePersisted({
      design: { bottle: { variantId: "cara-50", visible: false }, step: 3 },
    }, 4) as { design: { bottle: { visible: boolean } } };
    expect(chosen.design.bottle.visible).toBe(false);

    const other = migratePersisted({
      design: { bottle: { variantId: "diamond-50", visible: false }, step: 0 },
    }, 4) as { design: { bottle: { visible: boolean } } };
    expect(other.design.bottle.visible).toBe(false);

    const current = migratePersisted({
      design: { bottle: { variantId: "cara-50", visible: false }, step: 0 },
    }, 5) as { design: { bottle: { visible: boolean } } };
    expect(current.design.bottle.visible).toBe(false);
  });

  it("keeps unknown top-level fields and a null slot falls back", () => {
    const merged = mergePersistedLab(
      { workshopNote: "עבודה", brief: { title: "עבודה" }, priceOverrides: { cara: 12 }, exchangeRates: { USD: 3.7 }, design: { bottle: null, cap: null } },
      slice(),
    );
    const extra = merged as HydratedSlice & {
      workshopNote: string;
      brief: { ceilingIls: number; volumeMl: number; confirmed: boolean };
      priceOverrides: Record<string, unknown>;
      exchangeRates: { USD: number };
    };
    expect(extra.workshopNote).toBe("עבודה");
    expect(extra.brief).toEqual(DEFAULT_BUDGET_BRIEF);
    expect(extra.priceOverrides).toEqual({});
    expect(extra.exchangeRates).toEqual({ USD: 3.7 });
    expect(merged.design.bottle.variantId).toBe("cara-50");
    expect(merged.design.bottle.visible).toBe(true);
    expect(merged.design.cap.variantId).toBe("cap-cube-tall");
    expect("modal" in mergePersistedLab({ modal: "save", design: {} }, slice())).toBe(false);

    const undo = () => undefined;
    const mergedFns = mergePersistedLab(
      { undo: "replaced", note: "נשאר", brief: { title: "נשאר" } },
      { ...slice(), undo },
    ) as HydratedSlice & { undo: () => void; note: string; brief: typeof DEFAULT_BUDGET_BRIEF };
    expect(mergedFns.undo).toBe(undo);
    expect(mergedFns.note).toBe("נשאר");
    expect(mergedFns.brief).toEqual(DEFAULT_BUDGET_BRIEF);

    const partial = partializeLabState({
      ...slice(),
      brief: { title: "עבודה" },
      briefEditing: true,
      selected: "bottle",
      shareUrl: "https://example.test/#d=1",
      packNotices: ["something"],
      undo,
    });
    expect(partial.design).toEqual(slice().design);
    expect(partial.theme).toBe("dark");
    expect(partial.lang).toBe("he");
    expect(partial.brief).toEqual({ title: "עבודה" });
    expect("briefEditing" in partial).toBe(false);
    expect("selected" in partial).toBe(false);
    expect("shareUrl" in partial).toBe(false);
    expect("packNotices" in partial).toBe(false);
    expect("undo" in partial).toBe(false);
    expect("past" in partial).toBe(false);
    expect(Object.keys(partial).sort()).toEqual(["brief", "chat", "compareIds", "design", "lang", "pending", "saved", "theme"]);
  });

  it("reloads a fully configured box and leaves cutaway, quality, tier lock, and pack notices behind", async () => {
    const design = createDefaultDesign();
    design.box = hydrateBox({
      variantId: "box-rigid",
      finish: "leather",
      color: "#243044",
      heightMm: 140,
      widthMm: 90,
      depthMm: 70,
      linked: false,
      visible: true,
      structure: "drawer",
      latch: "ribbon",
      liftOff: { variant: "telescope-full", neckMm: 22, lidDepthMm: 48 },
      drawerPull: "notch",
      shape: { type: "polygon", sides: 8 },
      layers: [
        {
          role: "structure",
          structure: "sleeve",
          latch: "none",
          hingeAxis: "",
          doors: 1,
          drawerCount: 1,
          direction: "out",
          neckHeight: 0,
          splitPlaneAngle: 0,
          window: { shape: "rect", transparent: true },
          motion: null,
        },
        {
          role: "structure",
          structure: "drawer",
          latch: "ribbon",
          hingeAxis: "",
          doors: 1,
          drawerCount: 1,
          direction: "out",
          neckHeight: 0,
          splitPlaneAngle: 0,
          window: null,
          motion: null,
        },
      ],
      insertMotion: {
        trayLift: { height: 30, trigger: "lidAngle" },
        pullTab: true,
        extractDirection: "out",
        pose: { tiltAngle: 12, invert: false },
      },
      boardMm: 3.1,
      material: "carton",
      wrap: { color: "#243044", finish: "velvet" },
      ribbon: true,
      pullTab: true,
      outerWrap: "cellophane",
      insert: { material: "velvet-foam", orientation: "lying", clearanceMm: 4 },
    });

    const partial = partializeLabState({
      ...slice(design),
      brief: { projectName: "קופסה" },
      cutaway: true,
      quality: "high",
      tierLock: true,
      shareUrl: "https://example.test/#d=1",
      packNotices: [{ kind: "dropped", ref: "x" }],
    });
    expect(partial.brief).toEqual({ projectName: "קופסה" });
    expect("cutaway" in partial).toBe(false);
    expect("quality" in partial).toBe(false);
    expect("tierLock" in partial).toBe(false);
    expect("shareUrl" in partial).toBe(false);
    expect("packNotices" in partial).toBe(false);

    const mem: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => {
        mem[key] = value;
      },
      getItem: (key: string) => mem[key] ?? null,
      removeItem: (key: string) => {
        delete mem[key];
      },
    });
    const storage = createLabStorage<Record<string, unknown>>();
    storage.setItem("perfume-lab-v1", { state: partial, version: 6 });
    const raw = mem["perfume-lab-v1"] ?? "";
    expect(raw).toContain("telescope-full");
    expect(raw).toContain("notch");
    expect(raw).not.toContain("tierLock");
    expect(raw).not.toContain("cutaway");
    expect(raw).not.toContain("packNotices");

    const loaded = await storage.getItem("perfume-lab-v1");
    const live = { ...slice(), cutaway: false, quality: "fallback" as const, tierLock: false };
    const merged = mergePersistedLab(loaded?.state, live) as HydratedSlice & {
      brief: { title: string };
      cutaway: boolean;
      quality: string;
      tierLock: boolean;
    };
    expect(merged.design.box).toEqual(design.box);
    expect(merged.design.box.structure).toBe("drawer");
    expect(merged.design.box.latch).toBe("ribbon");
    expect(merged.design.box.liftOff).toEqual({ variant: "telescope-full", neckMm: 22, lidDepthMm: 48 });
    expect(merged.design.box.drawerPull).toBe("notch");
    expect(merged.design.box.shape).toEqual({ type: "polygon", sides: 8 });
    expect(merged.design.box.layers.map((layer) => layer.structure)).toEqual(["sleeve", "drawer"]);
    expect(merged.brief).toEqual({ ...DEFAULT_BUDGET_BRIEF, projectName: "קופסה" });
    expect(merged.cutaway).toBe(false);
    expect(merged.quality).toBe("fallback");
    expect(merged.tierLock).toBe(false);
  });

  it("keeps the current language on reset and does not pause writes or keep a share url", () => {
    resumeLabStorageWrites();
    const reset = resetPersistedPayload({
      lang: "he",
      chat: [{ id: "c1", role: "user", text: "שלום" }],
      shareUrl: "https://example.test/#d=1",
      workshopNote: "עבודה",
      brief: { title: "עבודה" },
    }, "en");
    expect(reset.state.lang).toBe("en");
    expect(reset.state.shareUrl).toBeUndefined();
    expect(reset.state.workshopNote).toBe("עבודה");
    expect(reset.state.brief).toEqual(DEFAULT_BUDGET_BRIEF);
    expect(reset.version).toBe(6);
    const fromRecord = resetPersistedPayload({ lang: "en", chat: [] });
    expect(fromRecord.state.lang).toBe("en");

    const mem: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => {
        mem[key] = value;
      },
      getItem: (key: string) => mem[key] ?? null,
      removeItem: (key: string) => {
        delete mem[key];
      },
    });
    createLabStorage().setItem("perfume-lab-v1", { state: { lang: "en" }, version: 5 });
    expect(mem["perfume-lab-v1"]).toContain("en");
  });

  it("fills a known bottle from its own spec and does not reopen the wizard when step is missing", () => {
    const design = sanitizeDesign({
      bottle: { variantId: "diamond-50", visible: true, finish: "tinted", color: "#112233" },
      cap: { heightMm: 26, widthMm: 26, finish: "silver", color: "#d5d8de", visible: true },
    });
    expect(design.bottle.variantId).toBe("diamond-50");
    expect(design.bottle.heightMm).toBe(104);
    expect(design.bottle.widthMm).toBe(50);
    expect(design.bottle.depthMm).toBe(50);
    expect(design.bottle.neck).toBe("FEA15");
    expect(design.bottle.finish).toBe("tinted");
    expect(design.cap.variantId).toBe("cap-sphere");
    expect(design.step).toBeUndefined();
  });

  it("rethrows a storage write after logging it", () => {
    const storage = createLabStorage();
    const error = new Error("quota");
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw error;
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => storage.setItem("perfume-lab-v1", { state: {}, version: 5 })).toThrow(error);
    expect(spy).toHaveBeenCalledWith(error);
    spy.mockRestore();
  });

  it("migrates a partial legacy blob without throwing", () => {
    expect(() => migratePersisted({ design: { bottle: {}, cap: {} } }, 0)).not.toThrow();
    const migrated = migratePersisted({ design: { bottle: {}, cap: {} } }, 1);
    expect(migrated).toMatchObject({ theme: "dark" });
    const merged = mergePersistedLab(migrated, slice());
    expect(merged.design.pump.variantId).toBe("pump-crimp");
    expect(merged.design.bottle.visible).toBe(true);
  });

  it("keeps a trailing emoji whole when stored label text is capped", () => {
    const wave = "👋";
    const text = "a".repeat(31) + wave;
    const design = sanitizeDesign({
      label: { variantId: "lg-heebo-word", text, color: "#141414", finish: "gold", scale: 1, visible: true },
    });
    expect(design.label.text).toBe(text);
    expect(text.slice(0, 32)).not.toBe(text);
    expect(Array.from(design.label.text)).toHaveLength(32);
  });

  it("restores light ink for an old dark label colour and cream for old foil", () => {
    const migrated = migratePersisted({
      design: {
        label: { variantId: "lg-heebo-word", color: "#141414", text: "NOIR" },
      },
      saved: [{
        id: "old",
        name: "Old",
        createdAt: 1,
        design: { label: { variantId: "lg-foil-word", color: "#141414", text: "NOIR" } },
      }],
    }, 5) as {
      design: { label: { color: string } };
      saved: Array<{ design: { label: { color: string } } }>;
    };
    expect(migrated.design.label.color).toBe("#f4eee4");
    expect(migrated.saved[0]?.design.label.color).toBe("#fff6e4");

    const current = migratePersisted({
      design: { label: { variantId: "lg-foil-word", color: "#c9a36a", text: "NOIR" } },
    }, 6) as { design: { label: { color: string } } };
    expect(current.design.label.color).toBe("#c9a36a");
  });

  it("migrates engrave, emboss, and chat snapshots, and leaves a missing label alone", () => {
    const migrated = migratePersisted({
      design: { label: { variantId: "lg-engrave-word", color: "#141414", text: "NOIR" } },
      past: [{ label: { variantId: "lg-emboss-mono", color: "#141414", text: "NOIR" } }],
      chat: [{
        id: "m1",
        role: "lab",
        snapshot: { label: { variantId: "lg-heebo-word", color: "#141414", text: "NOIR" } },
      }],
    }, 5) as {
      design: { label: { color: string } };
      past: Array<{ label: { color: string } }>;
      chat: Array<{ snapshot: { label: { color: string } } }>;
    };
    expect(migrated.design.label.color).toBe("#0c0b0a");
    expect(migrated.past[0]?.label.color).toBe("#f6f1e6");
    expect(migrated.chat[0]?.snapshot.label.color).toBe("#f4eee4");

    const missing = migratePersisted({ design: { bottle: { variantId: "cara-50" } } }, 5) as {
      design: { label?: unknown };
    };
    expect(missing.design.label).toBeUndefined();
  });

  it("keeps an imported supplier finish instead of rewriting it as decal", () => {
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
    try {
      const migrated = migratePersisted({
        design: { label: { variantId: "supplier-engrave", color: "#141414", text: "NOIR" } },
      }, 5) as { design: { label: { color: string } } };
      expect(migrated.design.label.color).toBe("#0c0b0a");

      const unknown = migratePersisted({
        design: { label: { variantId: "supplier-missing", color: "#141414", text: "NOIR" } },
      }, 5) as { design: { label: { color: string } } };
      expect(unknown.design.label.color).toBe("#141414");
    } finally {
      setImportedCatalog({ bottles: [], caps: [], labels: [], pumps: [], collars: [], boxes: [] });
    }
  });

  it("drops a corrupt budget and keeps a finite known-currency quote", () => {
    const merged = mergePersistedLab(
      {
        brief: { ceilingIls: Number.NaN, volumeMl: 12.5, confirmed: 1, quantity: 3, title: "לא" },
        priceOverrides: {
          ok: { value: 12.5, currency: "nis" },
          bad: { value: "12", currency: "USD" },
          unknown: { value: 4, currency: "dollar" },
          missing: { value: 4 },
          cleared: { absent: true },
          zero: { value: 0, currency: "EUR" },
          huge: { value: Number.POSITIVE_INFINITY, currency: "GBP" },
        },
        exchangeRates: { usd: 3.7, FOO: 2, EUR: Number.NaN, $: 3.65, "₪": 1, gbp: -4 },
      },
      slice(),
    ) as HydratedSlice & {
      brief: { ceilingIls: number; volumeMl: number; confirmed: boolean; quantity?: number; title?: string };
      priceOverrides: Record<string, { value?: number; currency?: string; absent?: true }>;
      exchangeRates: Record<string, number>;
    };
    expect(merged.brief).toEqual({ ceilingIls: 30, volumeMl: 12.5, confirmed: false, quantity: 3 });
    expect(merged.brief.title).toBeUndefined();
    expect(merged.priceOverrides).toEqual({
      ok: { value: 12.5, currency: "ILS" },
      cleared: { absent: true },
    });
    expect(merged.exchangeRates).toEqual({ USD: 3.65, ILS: 1 });
  });

  it("round-trips the budget through storage and ignores a corrupted reload", async () => {
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
      key: (index: number) => [...memory.keys()][index] ?? null,
      get length() {
        return memory.size;
      },
    });
    useLab.setState({
      brief: { ceilingIls: 30, volumeMl: 50, confirmed: false },
      briefEditing: false,
      priceOverrides: {},
      exchangeRates: {},
      libraryOpen: false,
      sideOpen: false,
    });
    useLab.getState().setBrief({ ceilingIls: 80, volumeMl: 30, quantity: 4 });
    useLab.getState().confirmBrief();
    useLab.getState().setPriceOverride("cara-50", { value: 90, currency: "ils" });
    useLab.getState().setPriceOverride("cap-cyl-32", { absent: true });
    useLab.getState().setExchangeRate("usd", 3.7);
    useLab.getState().openBrief();

    const written = JSON.parse(memory.get("perfume-lab-v1") ?? "{}") as {
      state: {
        brief: { ceilingIls: number; volumeMl: number; confirmed: boolean; quantity?: number };
        briefEditing?: boolean;
        priceOverrides: Record<string, { value?: number; currency?: string; absent?: true }>;
        exchangeRates: Record<string, number>;
      };
      version: number;
    };
    expect(written.version).toBe(6);
    expect(written.state.brief).toEqual({ ceilingIls: 80, volumeMl: 30, confirmed: true, quantity: 4 });
    expect(written.state.briefEditing).toBeUndefined();
    expect(written.state.priceOverrides["cara-50"]).toEqual({ value: 90, currency: "ils" });
    expect(written.state.priceOverrides["cap-cyl-32"]).toEqual({ absent: true });
    expect(written.state.exchangeRates).toEqual({ USD: 3.7 });

    await useLab.persist.rehydrate();
    expect(useLab.getState().brief).toEqual({ ceilingIls: 80, volumeMl: 30, confirmed: true, quantity: 4 });
    expect(useLab.getState().priceOverrides["cara-50"]).toEqual({ value: 90, currency: "ILS" });
    expect(useLab.getState().briefEditing).toBe(true);

    useLab.getState().closeBrief();
    written.state.brief = { ceilingIls: Number.NaN, volumeMl: 1000, confirmed: true, quantity: 0 } as typeof written.state.brief;
    written.state.priceOverrides = {
      "cara-50": { value: 90, currency: "ILS" },
      bad: { value: 1, currency: "dollar" },
      zero: { value: 0, currency: "USD" },
      cleared: { absent: true },
      "usd-cap": { value: 4, currency: "$" },
    };
    written.state.exchangeRates = { USD: 3.7, FOO: 9, $: 3.2 };
    written.state.briefEditing = true;
    written.version = 5;
    memory.set("perfume-lab-v1", JSON.stringify(written));
    await useLab.persist.rehydrate();

    expect(useLab.getState().brief).toEqual({ ceilingIls: 80, volumeMl: 1000, confirmed: true });
    expect(useLab.getState().briefEditing).toBe(false);
    expect(useLab.getState().priceOverrides).toEqual({
      "cara-50": { value: 90, currency: "ILS" },
      cleared: { absent: true },
      "usd-cap": { value: 4, currency: "USD" },
    });
    expect(useLab.getState().exchangeRates).toEqual({ USD: 3.2 });
    const reloaded = JSON.parse(memory.get("perfume-lab-v1") ?? "{}") as { state: { briefEditing?: boolean } };
    expect(reloaded.state.briefEditing).toBeUndefined();

    useLab.setState({
      brief: DEFAULT_BUDGET_BRIEF,
      briefEditing: false,
      priceOverrides: {},
      exchangeRates: {},
      libraryOpen: false,
      sideOpen: false,
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
