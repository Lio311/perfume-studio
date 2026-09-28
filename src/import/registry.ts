import { clearLatheProfiles, setLatheProfile } from "./lathe.ts";
import { setImportedCatalog } from "../model/catalog.ts";
import type { BottleSpec, BoxSpec, CapProfileName, CapSpec, CollarSpec, FinishId, LogoSpec, NeckId, PumpSpec, SectionKind, VariantPart } from "../model/types.ts";
import type { DraftItem, ImportProfile } from "./parseCatalog.ts";

export interface SupplierPart {
  id: string;
  kind: VariantPart;
  code: string;
  name: string;
  neck: NeckId | null;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  capacityMl: number | null;
  profile: ImportProfile;
  color: string;
  thumb: string;
  page: number;
  /** Normalised half-profile. Present for photo-revolved parts. */
  lathe?: number[];
}

export interface SupplierPack {
  id: string;
  name: string;
  createdAt: number;
  parts: SupplierPart[];
}

export interface ImportedMeta {
  color: string;
  thumb: string;
  neck: NeckId | null;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  supplierId: string;
  supplierName: string;
}

const meta = new Map<string, ImportedMeta>();

export function importedMeta(id: string): ImportedMeta | undefined {
  return meta.get(id);
}

export function partFromDraft(draft: DraftItem, supplier: { id: string; name: string }, index: number): SupplierPart {
  const code = draft.code || `${draft.kind}-${index + 1}`;
  const safe = code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `item-${index + 1}`;
  return {
    id: `${supplier.id}-${safe}`,
    kind: draft.kind,
    code,
    name: `${code} · ${supplier.name}`,
    neck: draft.neck,
    widthMm: draft.widthMm,
    heightMm: draft.heightMm,
    depthMm: draft.depthMm,
    capacityMl: draft.capacityMl,
    profile: draft.profile,
    color: "#c4a15a",
    thumb: "",
    page: draft.page,
  };
}

function tags(part: SupplierPart, supplier: SupplierPack): string[] {
  const base = ["imported", `supplier:${supplier.id}`, supplier.name, part.code, part.kind];
  if (!part.lathe) base.push("placeholder");
  if (part.neck) base.push(part.neck, part.neck.replace("FEA", "FEA "));
  return base;
}

function capProfile(profile: ImportProfile): CapProfileName {
  if (profile === "cube") return "cube";
  if (profile === "sphere") return "sphere";
  if (profile === "taper") return "taper";
  if (profile === "dome") return "dome";
  return "cylinder";
}

function capSection(profile: ImportProfile): SectionKind {
  return profile === "cube" ? "rect" : "circle";
}

export function syncRegistry(packs: SupplierPack[]): void {
  meta.clear();
  clearLatheProfiles();
  const bottles: BottleSpec[] = [];
  const caps: CapSpec[] = [];
  const labels: LogoSpec[] = [];
  const pumps: PumpSpec[] = [];
  const collars: CollarSpec[] = [];
  const boxes: BoxSpec[] = [];
  for (const pack of packs) {
    for (const part of pack.parts) {
      meta.set(part.id, {
        color: part.color,
        thumb: part.thumb,
        neck: part.neck,
        widthMm: part.widthMm,
        heightMm: part.heightMm,
        depthMm: part.depthMm,
        supplierId: pack.id,
        supplierName: pack.name,
      });
      if (part.lathe) setLatheProfile(part.id, { radii: part.lathe });
      const name = { he: part.name, en: part.name };
      const shared = tags(part, pack);
      if (part.kind === "bottle") {
        bottles.push({
          id: part.id,
          name,
          section: part.profile === "rect-bottle" ? "rect" : "circle",
          profile: part.profile === "sphere" ? "sphere" : part.profile === "rect-bottle" ? "classic" : "column",
          shoulder: 0.22,
          heightMm: part.heightMm,
          widthMm: part.widthMm,
          depthMm: part.depthMm,
          neck: part.neck ?? "FEA15",
          softness: part.profile === "rect-bottle" ? 0.35 : 0.8,
          faceted: false,
          tags: shared,
          supplier: { name: pack.name, ref: part.code, capacityMl: part.capacityMl ?? undefined },
          model: { type: "procedural" },
          capacityMl: part.capacityMl ?? Math.max(5, Math.round(part.widthMm * part.depthMm * part.heightMm / 1000)),
        });
      } else if (part.kind === "cap") {
        caps.push({
          id: part.id,
          name,
          section: capSection(part.profile),
          profile: capProfile(part.profile),
          heightMm: part.heightMm,
          widthMm: part.widthMm,
          depthMm: part.depthMm || part.widthMm,
          overhangMm: 1.2,
          softness: part.profile === "cube" ? 0.28 : 1,
          faceted: false,
          tags: shared,
          model: { type: "procedural" },
        });
      } else if (part.kind === "label") {
        labels.push({
          id: part.id,
          name,
          plate: "square",
          mark: "word",
          application: "decal",
          font: "heebo",
          frame: "hairline",
          tags: shared,
          model: { type: "procedural" },
          widthMm: part.widthMm,
          heightMm: part.heightMm,
        });
      } else if (part.kind === "pump") {
        pumps.push({
          id: part.id,
          name,
          style: "crimp",
          actuatorHeightMm: part.heightMm,
          radiusFactor: 0.55,
          nozzleMm: 8,
          tags: shared,
          model: { type: "procedural" },
        });
      } else if (part.kind === "collar") {
        collars.push({
          id: part.id,
          name,
          wallMm: 1.2,
          heightMm: part.heightMm,
          rings: 2,
          knurl: false,
          flareMm: 0.35,
          tags: shared,
          model: { type: "procedural" },
        });
      } else {
        boxes.push({
          id: part.id,
          name,
          form: "rigid",
          padMm: 8,
          liftMm: 12,
          tags: shared,
          model: { type: "procedural" },
        });
      }
    }
  }
  setImportedCatalog({ bottles, caps, labels, pumps, collars, boxes });
}

export function finishFromColor(hex: string, kind: VariantPart): FinishId {
  const raw = hex.replace("#", "");
  if (raw.length < 6) return kind === "bottle" ? "tinted" : "matteBlack";
  const r = Number.parseInt(raw.slice(0, 2), 16) / 255;
  const g = Number.parseInt(raw.slice(2, 4), 16) / 255;
  const b = Number.parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const sat = max - Math.min(r, g, b);
  if (kind === "bottle") return max > 0.82 && sat < 0.12 ? "frosted" : "tinted";
  if (kind === "box") return "matteBlack";
  if (sat > 0.08 && r > g && g > b && r > 0.45) return "gold";
  if (sat < 0.08 && max > 0.72) return "silver";
  if (r > b && b >= g && sat > 0.08) return "rose";
  return "matteBlack";
}
