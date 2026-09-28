/**
 * Box pack fields, validation, and cavity sizing.
 * Kept in this module on purpose: the supplier-pack price validator lands in a
 * different file, so a later rebase can move this without mixing the two.
 */
import { bottleById, capById, collarById, pumpById } from "./catalog.ts";
import { NECKS, neckRadius } from "./necks.ts";
import { bottleRadii, capRadius } from "./sample.ts";
import { closureById, listClosures, packById, resolveClosure } from "./closures/registry.ts";
import type { ClosureDimsRange, ClosureSpec } from "./closures/types.ts";
import type {
  BoxBoard,
  BoxForm,
  BoxInsert,
  BoxLatch,
  BoxState,
  CapProfileName,
  Design,
  DrawerPull,
  InsertMaterial,
  InsertOrientation,
  LiftOffState,
  OuterWrap,
  ProfileName,
  WrapFinish,
} from "./types.ts";

export const BOX_BOARDS = ["rigid", "carton"] as const;
export const WRAP_FINISHES = ["matte", "gloss", "soft-touch", "velvet", "paper-texture"] as const;
export const OUTER_WRAPS = ["none", "cellophane", "sleeve", "tissue"] as const;
export const INSERT_MATERIALS = ["eva", "pulp", "card", "velvet-foam"] as const;
export const INSERT_ORIENTATIONS = ["standing", "lying"] as const;

export const BOX_RANGES = {
  boardMm: [0.6, 4.5] as const,
  clearanceMm: [0.4, 8] as const,
  widthMm: [36, 260] as const,
  depthMm: [28, 220] as const,
  heightMm: [48, 320] as const,
};

export const LATCHES = ["magnet", "ribbon", "none"] as const;

export const DEFAULT_BOX_PACK: Pick<
  BoxState,
  "structure" | "latch" | "liftOff" | "drawerPull" | "boardMm" | "material" | "wrap" | "ribbon" | "pullTab" | "outerWrap" | "insert"
> = {
  structure: "lift-off",
  latch: "none",
  liftOff: { variant: "shoulder-neck", neckMm: 14, lidDepthMm: 28 },
  drawerPull: "none",
  boardMm: 2.2,
  material: "rigid",
  wrap: { color: "#14161c", finish: "soft-touch" },
  ribbon: false,
  pullTab: false,
  outerWrap: "none",
  insert: { material: "eva", orientation: "standing", clearanceMm: 2.5 },
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FLOOR_MM = 5;
const AIR_MM = 4;

export interface FieldIssue {
  path: string;
  message: string;
}

export interface CavityInput {
  bottleH: number;
  bottleW: number;
  bottleD: number;
  profile: ProfileName;
  shoulder: number;
  neckR: number;
  capH: number;
  capW: number;
  capD: number;
  capBottom: number;
  capProfile: CapProfileName;
  includeCap: boolean;
  pumpBase: number;
  actuatorH: number;
  actuatorR: number;
  nozzle: number;
  includePump: boolean;
  clearanceMm: number;
  orientation: InsertOrientation;
}

export interface CavitySpec {
  orientation: InsertOrientation;
  clearanceMm: number;
  /** Standing: plan width. Lying: cross width. */
  widthMm: number;
  /** Standing: plan depth. Lying: length along the bottle axis. */
  depthMm: number;
  /** Standing: well depth (the glass). Lying: vertical extent of the bottle. */
  heightMm: number;
  stackMm: number;
  samples: Array<{ t: number; rx: number; rz: number }>;
}

export interface BoxEnvelope {
  innerW: number;
  innerD: number;
  innerH: number;
  outerW: number;
  outerD: number;
  outerH: number;
  insertW: number;
  insertD: number;
  insertH: number;
  floorMm: number;
  boardMm: number;
  cavity: CavitySpec;
}

export function closureForForm(form: BoxForm): { structure: string; latch: BoxLatch } {
  const match = listClosures().find((spec) => spec.forms.includes(form));
  if (!match) return { structure: "lift-off", latch: "none" };
  return { structure: match.id, latch: match.preset.latch };
}

/** A structure id, a preset id, or a legacy closure id such as "magnetic". Does not warn. */
export function isKnownPack(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Boolean(packById(value));
}

function limitsFor(structure: unknown): ClosureDimsRange {
  if (typeof structure === "string") {
    const spec = closureById(structure);
    if (spec) return spec.dims;
  }
  return {
    widthMm: BOX_RANGES.widthMm,
    depthMm: BOX_RANGES.depthMm,
    heightMm: BOX_RANGES.heightMm,
  };
}

function liftSpec(): ClosureSpec["liftOff"] {
  return closureById("lift-off")?.liftOff;
}

const latchWarned = new Set<string>();
const variantWarned = new Set<string>();
const pullWarned = new Set<string>();

function resolveLatch(spec: ClosureSpec, value: unknown): BoxLatch {
  const fallback = spec.latches.includes(spec.preset.latch) ? spec.preset.latch : "none";
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !(LATCHES as readonly string[]).includes(value)) {
    if (typeof value === "string" && value && !latchWarned.has(value)) {
      latchWarned.add(value);
      console.warn(`Unknown box latch "${value}". Using ${fallback}.`);
    }
    return fallback;
  }
  const latch = value as BoxLatch;
  if (spec.latches.includes(latch)) return latch;
  const key = `${spec.id}:${latch}`;
  if (!latchWarned.has(key)) {
    latchWarned.add(key);
    console.warn(`Latch "${latch}" is not valid on "${spec.id}". Using ${fallback}.`);
  }
  return fallback;
}

function resolveLiftOff(raw: Partial<LiftOffState> | null | undefined): LiftOffState {
  const spec = liftSpec();
  const defaults = spec?.defaults ?? DEFAULT_BOX_PACK.liftOff;
  const variants = spec?.variants.map((item) => item.id) ?? [defaults.variant];
  let variant = defaults.variant;
  if (typeof raw?.variant === "string" && raw.variant) {
    if (variants.includes(raw.variant)) variant = raw.variant;
    else if (!variantWarned.has(raw.variant)) {
      variantWarned.add(raw.variant);
      console.warn(`Unknown lift-off variant "${raw.variant}". Using ${defaults.variant}.`);
    }
  }
  const neck = spec?.neckMm ?? [6, 36];
  const lid = spec?.lidDepthMm ?? [12, 160];
  const neckMm = typeof raw?.neckMm === "number" && Number.isFinite(raw.neckMm) ? raw.neckMm : defaults.neckMm;
  const lidDepthMm = typeof raw?.lidDepthMm === "number" && Number.isFinite(raw.lidDepthMm) ? raw.lidDepthMm : defaults.lidDepthMm;
  return {
    variant,
    neckMm: clamp(neckMm, neck[0], neck[1]),
    lidDepthMm: clamp(lidDepthMm, lid[0], lid[1]),
  };
}

function resolveDrawerPull(value: unknown): DrawerPull {
  const pulls = closureById("drawer")?.pulls ?? ["none", "ribbon", "notch"];
  if (value === undefined || value === null || value === "") return "none";
  if (typeof value === "string" && pulls.includes(value)) return value as DrawerPull;
  if (typeof value === "string" && value && !pullWarned.has(value)) {
    pullWarned.add(value);
    console.warn(`Unknown drawer pull "${value}". Using none.`);
  }
  return "none";
}

function inEnum(list: readonly string[], value: unknown): boolean {
  return typeof value === "string" && list.includes(value);
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function pickEnum<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function validateBoxFields(box: Partial<BoxState> | null | undefined): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (!box) {
    issues.push({ path: "box", message: "missing" });
    return issues;
  }
  const spec = typeof box.structure === "string" ? closureById(box.structure) : undefined;
  if (!spec) issues.push({ path: "structure", message: "enum" });
  if (!inEnum(LATCHES, box.latch)) issues.push({ path: "latch", message: "enum" });
  else if (spec && !spec.latches.includes(box.latch as BoxLatch)) issues.push({ path: "latch", message: "latch" });
  const lift = liftSpec();
  const liftOff = box.liftOff;
  if (
    !liftOff ||
    !lift ||
    !lift.variants.some((item) => item.id === liftOff.variant) ||
    !inRange(liftOff.neckMm, lift.neckMm[0], lift.neckMm[1]) ||
    !inRange(liftOff.lidDepthMm, lift.lidDepthMm[0], lift.lidDepthMm[1])
  ) {
    issues.push({ path: "liftOff", message: "liftOff" });
  }
  const pulls = closureById("drawer")?.pulls ?? ["none"];
  if (!inEnum(pulls, box.drawerPull)) issues.push({ path: "drawerPull", message: "enum" });
  if (!inRange(box.boardMm, BOX_RANGES.boardMm[0], BOX_RANGES.boardMm[1])) issues.push({ path: "boardMm", message: "range" });
  if (!inEnum(BOX_BOARDS, box.material)) issues.push({ path: "material", message: "enum" });
  if (!box.wrap || !HEX.test(box.wrap.color ?? "") || !inEnum(WRAP_FINISHES, box.wrap.finish)) {
    issues.push({ path: "wrap", message: "wrap" });
  }
  if (typeof box.ribbon !== "boolean") issues.push({ path: "ribbon", message: "boolean" });
  if (typeof box.pullTab !== "boolean") issues.push({ path: "pullTab", message: "boolean" });
  if (!inEnum(OUTER_WRAPS, box.outerWrap)) issues.push({ path: "outerWrap", message: "enum" });
  const insert: Partial<BoxInsert> | undefined = box.insert;
  if (
    !insert ||
    !inEnum(INSERT_MATERIALS, insert.material) ||
    !inEnum(INSERT_ORIENTATIONS, insert.orientation) ||
    !inRange(insert.clearanceMm, BOX_RANGES.clearanceMm[0], BOX_RANGES.clearanceMm[1])
  ) {
    issues.push({ path: "insert", message: "insert" });
  }
  const limits = limitsFor(box.structure);
  if (box.widthMm !== undefined && !inRange(box.widthMm, limits.widthMm[0], limits.widthMm[1])) {
    issues.push({ path: "widthMm", message: "range" });
  }
  if (box.depthMm !== undefined && !inRange(box.depthMm, limits.depthMm[0], limits.depthMm[1])) {
    issues.push({ path: "depthMm", message: "range" });
  }
  if (box.heightMm !== undefined && !inRange(box.heightMm, limits.heightMm[0], limits.heightMm[1])) {
    issues.push({ path: "heightMm", message: "range" });
  }
  return issues;
}

export function hydrateBox(box: (Partial<BoxState> & { closure?: unknown }) | null | undefined): BoxState {
  const raw = box ?? {};
  const named = typeof raw.structure === "string" && raw.structure ? raw.structure : raw.closure;
  const spec = resolveClosure(typeof named === "string" && named ? named : undefined);
  const wrap = raw.wrap;
  const insert = raw.insert;
  const color = HEX.test(raw.color ?? "") ? raw.color! : "#14161c";
  const width = typeof raw.widthMm === "number" && Number.isFinite(raw.widthMm) ? raw.widthMm : 78;
  const depth = typeof raw.depthMm === "number" && Number.isFinite(raw.depthMm) ? raw.depthMm : 68;
  const height = typeof raw.heightMm === "number" && Number.isFinite(raw.heightMm) ? raw.heightMm : 120;
  return {
    variantId: raw.variantId || "box-rigid",
    finish: raw.finish ?? "matteBlack",
    color,
    widthMm: clamp(width, BOX_RANGES.widthMm[0], BOX_RANGES.widthMm[1]),
    depthMm: clamp(depth, BOX_RANGES.depthMm[0], BOX_RANGES.depthMm[1]),
    heightMm: clamp(height, BOX_RANGES.heightMm[0], BOX_RANGES.heightMm[1]),
    linked: raw.linked !== false,
    visible: raw.visible === true,
    structure: spec.id,
    latch: resolveLatch(spec, raw.latch),
    liftOff: resolveLiftOff(raw.liftOff),
    drawerPull: resolveDrawerPull(raw.drawerPull),
    boardMm:
      typeof raw.boardMm === "number" && Number.isFinite(raw.boardMm)
        ? clamp(raw.boardMm, BOX_RANGES.boardMm[0], BOX_RANGES.boardMm[1])
        : DEFAULT_BOX_PACK.boardMm,
    material: pickEnum<BoxBoard>(BOX_BOARDS, raw.material, "rigid"),
    wrap: {
      color: wrap && HEX.test(wrap.color) ? wrap.color : color,
      finish: pickEnum<WrapFinish>(WRAP_FINISHES, wrap?.finish, DEFAULT_BOX_PACK.wrap.finish),
    },
    ribbon: raw.ribbon === true,
    pullTab: raw.pullTab === true,
    outerWrap: pickEnum<OuterWrap>(OUTER_WRAPS, raw.outerWrap, "none"),
    insert: {
      material: pickEnum<InsertMaterial>(INSERT_MATERIALS, insert?.material, "eva"),
      orientation: pickEnum<InsertOrientation>(INSERT_ORIENTATIONS, insert?.orientation, "standing"),
      clearanceMm:
        typeof insert?.clearanceMm === "number" && Number.isFinite(insert.clearanceMm)
          ? clamp(insert.clearanceMm, BOX_RANGES.clearanceMm[0], BOX_RANGES.clearanceMm[1])
          : DEFAULT_BOX_PACK.insert.clearanceMm,
    },
  };
}

export function deriveCavity(input: CavityInput): CavitySpec {
  const clearance = input.clearanceMm;
  const capTop = input.capBottom + input.capH;
  const pumpTop = input.pumpBase + input.actuatorH;
  const stack = Math.max(input.bottleH, input.includeCap ? capTop : 0, input.includePump ? pumpTop : 0);
  const steps = 24;
  let maxRx = 0.8;
  let maxRz = 0.8;
  const samples: CavitySpec["samples"] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const y = t * stack;
    let rx = 0;
    let rz = 0;
    if (y <= input.bottleH) {
      const radii = bottleRadii(y, input.bottleH, input.bottleW, input.bottleD, input.profile, input.shoulder, input.neckR);
      rx = radii.rx;
      rz = radii.rz;
    }
    if (input.includeCap && y >= input.capBottom && y <= capTop) {
      const ct = input.capH > 0 ? (y - input.capBottom) / input.capH : 0;
      rx = Math.max(rx, capRadius(ct, input.capProfile, input.capW / 2));
      rz = Math.max(rz, capRadius(ct, input.capProfile, input.capD / 2));
    }
    if (input.includePump && y >= input.pumpBase && y <= pumpTop) {
      rx = Math.max(rx, input.actuatorR + input.nozzle);
      rz = Math.max(rz, input.actuatorR);
    }
    rx += clearance;
    rz += clearance;
    maxRx = Math.max(maxRx, rx);
    maxRz = Math.max(maxRz, rz);
    samples.push({ t, rx, rz });
  }
  if (input.orientation === "lying") {
    return {
      orientation: "lying",
      clearanceMm: clearance,
      widthMm: maxRx * 2,
      depthMm: stack + clearance * 2,
      heightMm: maxRz * 2,
      stackMm: stack,
      samples,
    };
  }
  return {
    orientation: "standing",
    clearanceMm: clearance,
    widthMm: maxRx * 2,
    depthMm: maxRz * 2,
    heightMm: input.bottleH,
    stackMm: stack,
    samples,
  };
}

export function deriveEnvelope(cavity: CavitySpec, boardMm: number, limits?: ClosureDimsRange): BoxEnvelope {
  const width = limits?.widthMm ?? BOX_RANGES.widthMm;
  const depth = limits?.depthMm ?? BOX_RANGES.depthMm;
  const height = limits?.heightMm ?? BOX_RANGES.heightMm;
  const margin = Math.max(8, cavity.clearanceMm * 2);
  const insertW = cavity.widthMm + margin * 2;
  const insertD = cavity.depthMm + margin * 2;
  const insertH = cavity.heightMm + FLOOR_MM;
  const innerW = insertW;
  const innerD = insertD;
  const innerH = Math.max(insertH, cavity.stackMm + FLOOR_MM) + AIR_MM;
  return {
    innerW,
    innerD,
    innerH,
    outerW: clamp(innerW + boardMm * 2, width[0], width[1]),
    outerD: clamp(innerD + boardMm * 2, depth[0], depth[1]),
    outerH: clamp(innerH + boardMm * 2, height[0], height[1]),
    insertW,
    insertD,
    insertH,
    floorMm: FLOOR_MM,
    boardMm,
    cavity,
  };
}

/** Bottle + selected cap + selected pump, using the same neck seating as the fitter. */
export function cavityFromDesign(design: Design, orientation?: InsertOrientation): CavitySpec {
  const bottle = bottleById(design.bottle.variantId);
  const cap = capById(design.cap.variantId);
  const collar = collarById(design.collar.variantId);
  const pump = pumpById(design.pump.variantId);
  const neck = NECKS[design.bottle.neck];
  const neckR = neckRadius(design.bottle.neck);
  const bottleH = design.bottle.heightMm;
  const ferrule = neck.ferrule;
  const stockFerrule = collar.tags.includes("crimp") && collar.tags.includes("standard");
  const collarInner = ferrule.innerMm / 2;
  const collarOuter = stockFerrule ? ferrule.outerMm / 2 : Math.max(ferrule.outerMm / 2, collarInner + collar.wallMm);
  const collarHeight = stockFerrule
    ? Math.min(ferrule.heightMaxMm, Math.max(ferrule.heightMinMm, collar.heightMm))
    : collar.heightMm;
  const collarBottom = bottleH - Math.min(collarHeight * 0.72, neck.crimpMm * 0.85);
  const collarTop = collarBottom + collarHeight;
  const capH = design.cap.heightMm;
  const capW = Math.max(design.cap.widthMm, (collarOuter + cap.overhangMm) * 2);
  const capD = Math.max(cap.depthMm * (capW / Math.max(1, cap.widthMm)), (collarOuter + cap.overhangMm) * 2);
  const pack = hydrateBox(design.box);
  return deriveCavity({
    bottleH,
    bottleW: design.bottle.widthMm,
    bottleD: design.bottle.depthMm,
    profile: bottle.profile,
    shoulder: bottle.shoulder,
    neckR,
    capH,
    capW,
    capD,
    capBottom: collarTop - 0.45,
    capProfile: cap.profile,
    includeCap: true,
    pumpBase: collarTop - 0.3,
    actuatorH: pump.actuatorHeightMm,
    actuatorR: Math.max(neckR * pump.radiusFactor, neckR * 0.42),
    nozzle: pump.nozzleMm,
    includePump: true,
    clearanceMm: pack.insert.clearanceMm,
    orientation: orientation ?? pack.insert.orientation,
  });
}

export function envelopeFromDesign(design: Design): BoxEnvelope {
  const pack = hydrateBox(design.box);
  const spec = closureById(pack.structure) ?? closureById("lift-off");
  return deriveEnvelope(cavityFromDesign(design), pack.boardMm, spec?.dims);
}
