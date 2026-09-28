import { describe, expect, it } from "vitest";
import { createDefaultDesign } from "../model/design.ts";
import type { Design } from "../model/types.ts";
import { mergePersistedLab, migratePersisted, readStorageValue, sanitizeDesign, type HydratedSlice } from "./hydrate.ts";

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
    expect(empty.design).toEqual(createDefaultDesign());

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
    expect(merged.design.liquid.visible).toBe(false);
    expect(merged.theme).toBe("dark");
    expect(merged.lang).toBe("he");
    expect(merged.chat).toEqual([
      { id: "m2", role: "lab", text: "שלום", snapshot: defaults },
    ]);
    expect(merged.past).toEqual([defaults]);
    expect(merged.saved).toEqual([]);
    expect(merged.compareIds).toEqual(["seed-atelier"]);
  });

  it("replaces an unknown variant id with that slot's default", () => {
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
    expect(merged.design.cap.heightMm).toBe(createDefaultDesign().cap.heightMm);
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
    expect(merged.design.pump).toEqual(defaults.pump);
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

  it("migrates a partial legacy blob without throwing", () => {
    expect(() => migratePersisted({ design: { bottle: {}, cap: {} } }, 0)).not.toThrow();
    const migrated = migratePersisted({ design: { bottle: {}, cap: {} } }, 1);
    expect(migrated).toMatchObject({ theme: "dark" });
    const merged = mergePersistedLab(migrated, slice());
    expect(merged.design.pump.variantId).toBe("pump-crimp");
    expect(merged.design.bottle.visible).toBe(true);
  });
});
