import { importedMeta } from "../import/registry.ts";
import { bottleById, boxById, capById, collarById, listFor, logoById, pumpById } from "../model/catalog.ts";
import type { BottleSpec, VariantPart } from "../model/types.ts";
import type { PartFacts } from "./types.ts";
import { nominalFillMl } from "./volume.ts";

const MATERIAL_ORDER = ["zamac", "surlyn", "wood", "acrylic", "magnetic", "sculptural", "crystal", "luxury", "metal"] as const;

export function materialFromTags(tags: string[], kind: VariantPart): string {
  const lower = new Set(tags.map((tag) => tag.toLowerCase()));
  for (const key of MATERIAL_ORDER) {
    if (lower.has(key)) return key;
  }
  if (kind === "bottle") return "glass";
  if (kind === "box") return "carton";
  if (kind === "label") return "paper";
  if (kind === "pump" || kind === "collar") return "metal";
  return "other";
}

function supplierOf(id: string, named: string | undefined): { supplierName: string | null; namedSupplier: boolean; fromPack: boolean } {
  const meta = importedMeta(id);
  const supplierName = meta?.supplierName || named || null;
  return { supplierName, namedSupplier: Boolean(supplierName), fromPack: Boolean(meta) };
}

function bottleFacts(spec: BottleSpec): PartFacts {
  const supplier = supplierOf(spec.id, spec.supplier?.name);
  return {
    id: spec.id,
    kind: "bottle",
    nameHe: spec.name.he,
    nameEn: spec.name.en,
    neck: spec.neck,
    widthMm: spec.widthMm,
    heightMm: spec.heightMm,
    depthMm: spec.depthMm,
    section: spec.section,
    profile: spec.profile,
    material: materialFromTags(spec.tags, "bottle"),
    fillMl: nominalFillMl(spec),
    ...supplier,
  };
}

export function factsById(kind: VariantPart, id: string): PartFacts | null {
  if (kind === "bottle") return bottleFacts(bottleById(id));
  if (kind === "cap") {
    const spec = capById(id);
    const meta = importedMeta(id);
    const supplier = supplierOf(id, undefined);
    return {
      id: spec.id,
      kind: "cap",
      nameHe: spec.name.he,
      nameEn: spec.name.en,
      neck: meta?.neck ?? null,
      widthMm: spec.widthMm,
      heightMm: spec.heightMm,
      depthMm: spec.depthMm,
      section: spec.section,
      profile: spec.profile,
      material: materialFromTags(spec.tags, "cap"),
      fillMl: null,
      ...supplier,
    };
  }
  if (kind === "label") {
    const spec = logoById(id);
    const supplier = supplierOf(id, undefined);
    return {
      id: spec.id,
      kind: "label",
      nameHe: spec.name.he,
      nameEn: spec.name.en,
      neck: null,
      widthMm: spec.widthMm ?? 28,
      heightMm: spec.heightMm ?? 18,
      depthMm: 0.2,
      section: spec.plate,
      profile: spec.mark,
      material: materialFromTags(spec.tags, "label"),
      fillMl: null,
      ...supplier,
    };
  }
  if (kind === "pump") {
    const spec = pumpById(id);
    const meta = importedMeta(id);
    const supplier = supplierOf(id, undefined);
    return {
      id: spec.id,
      kind: "pump",
      nameHe: spec.name.he,
      nameEn: spec.name.en,
      neck: meta?.neck ?? null,
      widthMm: spec.nozzleMm,
      heightMm: spec.actuatorHeightMm,
      depthMm: Math.round((spec.widthMm ?? (spec.radiusFactor ?? 0.42) * 15) * 10) / 10,
      section: "circle",
      profile: spec.style,
      material: materialFromTags(spec.tags, "pump"),
      fillMl: null,
      ...supplier,
    };
  }
  if (kind === "collar") {
    const spec = collarById(id);
    const meta = importedMeta(id);
    const supplier = supplierOf(id, undefined);
    return {
      id: spec.id,
      kind: "collar",
      nameHe: spec.name.he,
      nameEn: spec.name.en,
      neck: meta?.neck ?? null,
      widthMm: spec.wallMm,
      heightMm: spec.heightMm,
      depthMm: spec.flareMm,
      section: "circle",
      profile: spec.knurl ? "knurl" : `${spec.rings}-ring`,
      material: materialFromTags(spec.tags, "collar"),
      fillMl: null,
      ...supplier,
    };
  }
  const spec = boxById(id);
  const supplier = supplierOf(id, undefined);
  return {
    id: spec.id,
    kind: "box",
    nameHe: spec.name.he,
    nameEn: spec.name.en,
    neck: null,
    widthMm: spec.padMm,
    heightMm: spec.liftMm,
    depthMm: spec.padMm,
    section: "rect",
    profile: spec.form,
    material: materialFromTags(spec.tags, "box"),
    fillMl: null,
    ...supplier,
  };
}

export function allFacts(kind: VariantPart): PartFacts[] {
  const seen = new Set<string>();
  const facts: PartFacts[] = [];
  for (const entry of listFor(kind)) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const row = factsById(kind, entry.id);
    if (row) facts.push(row);
  }
  return facts;
}
