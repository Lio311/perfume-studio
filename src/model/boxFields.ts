/**
 * Box pack fields, validation, and cavity sizing.
 * Kept in this module on purpose: the supplier-pack price validator lands in a
 * different file, so a later rebase can move this without mixing the two.
 */
import { bottleById, capById, collarById, pumpById } from "./catalog.ts";
import { FINISHES } from "./materials.ts";
import { NECKS, neckRadius, neckStandard } from "./necks.ts";
import { bottleRadii, capRadius } from "./sample.ts";
import { closureById, listClosures, packById, resolveClosure } from "./closures/registry.ts";
import { readMotions, type ClosureDimsRange, type ClosureSpec } from "./closures/types.ts";
import type {
  BoxBoard,
  BoxForm,
  BoxInsert,
  BoxLatch,
  BoxLayer,
  BoxShape,
  BoxState,
  CapProfileName,
  Design,
  DrawerPull,
  FinishId,
  InsertMaterial,
  InsertMotion,
  InsertOrientation,
  LiftOffState,
  OuterWrap,
  ProfileName,
  SleeveWindow,
  StructureMotion,
  WrapFinish,
} from "./types.ts";

export const BOX_BOARDS = ["rigid", "carton"] as const;
export const WRAP_FINISHES = ["matte", "gloss", "soft-touch", "velvet", "paper-texture"] as const;
export const OUTER_WRAPS = ["none", "cellophane", "sleeve", "tissue"] as const;
export const INSERT_MATERIALS = ["eva", "pulp", "card", "velvet-foam"] as const;
export const INSERT_ORIENTATIONS = ["standing", "lying"] as const;
const FINISH_IDS = FINISHES.map((item) => item.id);

export const BOX_RANGES = {
  boardMm: [0.6, 4.5] as const,
  clearanceMm: [0.4, 8] as const,
  widthMm: [36, 260] as const,
  depthMm: [28, 220] as const,
  heightMm: [48, 320] as const,
};

export const LATCHES = ["magnet", "ribbon", "none"] as const;

export const SHAPE_TYPES = ["rect", "cylinder", "polygon"] as const;
export const TRAY_LIFT_MM: readonly [number, number] = [0, 80];

export const DEFAULT_INSERT_MOTION: InsertMotion = {
  trayLift: { height: 0, trigger: "lidAngle" },
  pullTab: false,
  extractDirection: "up",
  pose: { tiltAngle: 0, invert: false },
};

export const DEFAULT_BOX_PACK: Pick<
  BoxState,
  | "structure"
  | "latch"
  | "liftOff"
  | "drawerPull"
  | "shape"
  | "layers"
  | "insertMotion"
  | "boardMm"
  | "material"
  | "wrap"
  | "ribbon"
  | "pullTab"
  | "outerWrap"
  | "insert"
> = {
  /** Inner box under the sleeve. The sleeve is the outer layer in `layers`. */
  structure: "lift-off",
  latch: "none",
  liftOff: { variant: "shoulder-neck", neckMm: 14, lidDepthMm: 28 },
  drawerPull: "none",
  shape: { type: "rect" },
  /** Sleeve over an inner box. The sleeve slides off; the magnet stays off. */
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
      window: null,
      motion: null,
    },
    {
      role: "structure",
      structure: "lift-off",
      latch: "none",
      hingeAxis: "",
      doors: 1,
      drawerCount: 1,
      direction: "out",
      neckHeight: 14,
      splitPlaneAngle: 0,
      window: null,
      motion: null,
    },
  ],
  insertMotion: DEFAULT_INSERT_MOTION,
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

/**
 * The catalog tube is drawn by the closure builder.
 * A plinth still uses the older mesh; there is no plinth closure yet.
 */
export function usesLegacyBoxMesh(form: BoxForm, structure: string): boolean {
  if (form === "tube") return false;
  return form === "plinth" && structure === closureForForm(form).structure;
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

const shapeWarned = new Set<string>();

function blankLayer(structure: string, latch: BoxLatch, neckHeight = 0): BoxLayer {
  return {
    role: "structure",
    structure,
    latch,
    hingeAxis: "",
    doors: 1,
    drawerCount: 1,
    direction: "out",
    neckHeight,
    splitPlaneAngle: 0,
    window: null,
    motion: null,
  };
}

function plainMotion(raw: unknown): StructureMotion | null {
  const motions = readMotions(raw && typeof raw === "object" ? { motions: [raw as { type?: unknown; params?: unknown }] } : {});
  return motions[0] ?? null;
}

function resolveWindow(raw: unknown): SleeveWindow | null {
  if (raw == null) return null;
  if (typeof raw !== "object") return null;
  const window = raw as { shape?: unknown; transparent?: unknown };
  const shape = typeof window.shape === "string" && window.shape ? window.shape.slice(0, 24) : "rect";
  return { shape, transparent: window.transparent !== false };
}

function resolveShape(raw: unknown): BoxShape {
  const record = raw && typeof raw === "object" ? (raw as { type?: unknown; sides?: unknown }) : undefined;
  const type = record?.type;
  if (type === "cylinder") return { type: "cylinder" };
  if (type === "polygon") {
    const sides = typeof record?.sides === "number" && Number.isFinite(record.sides) ? Math.round(record.sides) : 6;
    return { type: "polygon", sides: clamp(sides, 3, 12) };
  }
  if (typeof type === "string" && type && type !== "rect" && !shapeWarned.has(type)) {
    shapeWarned.add(type);
    console.warn(`Unknown box shape "${type}". Using rect.`);
  }
  return { type: "rect" };
}

/**
 * What the mesh should draw. An octagon is built for lift-off. Other polygons, and a
 * cylinder on anything but lift-off or tube, become a rect.
 * A tube is round even when the saved plan is a rect. The warning fires once per shape.
 */
export function renderedShape(shape: BoxShape, structureId: string): BoxShape {
  if (structureId === "tube") return { type: "cylinder" };
  if (shape.type === "cylinder" && structureId === "lift-off") return { type: "cylinder" };
  if (shape.type === "polygon" && structureId === "lift-off") return shape;
  if (shape.type === "rect") return { type: "rect" };
  const key = `${shape.type}:${structureId}`;
  if (!shapeWarned.has(key)) {
    shapeWarned.add(key);
    const why = shape.type === "cylinder" ? "Cylinder is built for lift-off only." : `Box shape "${shape.type}" is not built yet.`;
    console.warn(`${why} Using rect.`);
  }
  return { type: "rect" };
}

interface InsertLayerNote {
  insert: {
    trayLift?: { height: number; trigger: string };
    pullTab?: boolean;
    extractDirection?: string;
    tiltAngle?: number;
    invert?: boolean;
  };
}

function resolveLayer(raw: unknown, fallback: BoxLayer): BoxLayer | InsertLayerNote {
  if (!raw || typeof raw !== "object") return fallback;
  const record = raw as {
    role?: unknown;
    structure?: unknown;
    closure?: unknown;
    latch?: unknown;
    magnetic?: unknown;
    hingeAxis?: unknown;
    doors?: unknown;
    drawerCount?: unknown;
    direction?: unknown;
    neckHeight?: unknown;
    splitPlaneAngle?: unknown;
    window?: unknown;
    motion?: unknown;
    insert?: unknown;
  };
  if (record.insert && record.structure == null && record.closure == null) {
    const insert = record.insert as {
      trayLift?: { height?: unknown; trigger?: unknown };
      pullTab?: unknown;
      extractDirection?: unknown;
      tiltAngle?: unknown;
      invert?: unknown;
    };
    return {
      insert: {
        trayLift: {
          height: typeof insert.trayLift?.height === "number" ? insert.trayLift.height : 0,
          trigger: typeof insert.trayLift?.trigger === "string" ? insert.trayLift.trigger : "lidAngle",
        },
        pullTab: insert.pullTab === true,
        extractDirection: typeof insert.extractDirection === "string" ? insert.extractDirection : undefined,
        tiltAngle: typeof insert.tiltAngle === "number" ? insert.tiltAngle : undefined,
        invert: insert.invert === true,
      },
    };
  }
  const named = typeof record.structure === "string" && record.structure ? record.structure : record.closure;
  const spec = resolveClosure(typeof named === "string" && named ? named : fallback.structure);
  const latch = record.magnetic === true && (record.latch == null || record.latch === "")
    ? resolveLatch(spec, "magnet")
    : resolveLatch(spec, record.latch ?? fallback.latch);
  const doors = record.doors === 2 ? 2 : 1;
  const drawerCount = typeof record.drawerCount === "number" && Number.isFinite(record.drawerCount) ? Math.round(record.drawerCount) : 1;
  const neckHeight = typeof record.neckHeight === "number" && Number.isFinite(record.neckHeight) ? record.neckHeight : fallback.neckHeight;
  const split = typeof record.splitPlaneAngle === "number" && Number.isFinite(record.splitPlaneAngle) ? record.splitPlaneAngle : 0;
  return {
    role: "structure",
    structure: spec.id,
    latch,
    hingeAxis: typeof record.hingeAxis === "string" ? record.hingeAxis.slice(0, 32) : "",
    doors,
    drawerCount: clamp(drawerCount, 1, 8),
    direction: typeof record.direction === "string" && record.direction ? record.direction.slice(0, 32) : "out",
    neckHeight: clamp(neckHeight, 0, 80),
    splitPlaneAngle: clamp(split, -180, 180),
    window: resolveWindow(record.window),
    motion: plainMotion(record.motion),
  };
}

function resolveInsertMotion(raw: unknown, pullTab: boolean, fromLayer?: InsertLayerNote["insert"]): InsertMotion {
  const record = raw && typeof raw === "object" ? (raw as Partial<InsertMotion>) : undefined;
  const lift = record?.trayLift ?? fromLayer?.trayLift;
  const height = typeof lift?.height === "number" && Number.isFinite(lift.height) ? lift.height : 0;
  const trigger = typeof lift?.trigger === "string" && lift.trigger ? lift.trigger.slice(0, 32) : "lidAngle";
  const pose = record?.pose;
  const tilt = typeof pose?.tiltAngle === "number" ? pose.tiltAngle : fromLayer?.tiltAngle ?? 0;
  return {
    trayLift: { height: clamp(height, TRAY_LIFT_MM[0], TRAY_LIFT_MM[1]), trigger },
    pullTab: record?.pullTab === true || fromLayer?.pullTab === true || (record == null && fromLayer == null && pullTab),
    extractDirection: typeof record?.extractDirection === "string" && record.extractDirection
      ? record.extractDirection.slice(0, 24)
      : fromLayer?.extractDirection ?? "up",
    pose: {
      tiltAngle: clamp(tilt, -180, 180),
      invert: pose?.invert === true || fromLayer?.invert === true,
    },
  };
}

export function structureLayers(layers: readonly BoxLayer[]): BoxLayer[] {
  return layers.filter((layer) => layer.role === "structure");
}

export function sleeveOverActive(layers: readonly BoxLayer[]): boolean {
  const structures = structureLayers(layers);
  return structures.length >= 2 && structures[0]?.structure === "sleeve";
}

export function withInnerStructure(layers: readonly BoxLayer[], structure: string, latch: BoxLatch): BoxLayer[] {
  const next = layers.map((layer) => ({ ...layer, window: layer.window ? { ...layer.window } : null, motion: layer.motion ? { type: layer.motion.type, params: { ...layer.motion.params } } : null }));
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].role === "structure") {
      next[i] = { ...next[i], structure, latch };
      return next;
    }
  }
  return [blankLayer(structure, latch), ...next];
}

export function withNeckHeight(layers: readonly BoxLayer[], neckHeight: number): BoxLayer[] {
  const next = withInnerStructure(layers, innermost(layers)?.structure ?? "lift-off", innermost(layers)?.latch ?? "none");
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].role === "structure") {
      next[i] = { ...next[i], neckHeight };
      return next;
    }
  }
  return next;
}

function innermost(layers: readonly BoxLayer[]): BoxLayer | undefined {
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    if (layers[i].role === "structure") return layers[i];
  }
  return undefined;
}

export function withSleeveOver(box: Pick<BoxState, "layers" | "structure" | "latch" | "liftOff">, on: boolean): BoxLayer[] {
  const structures = structureLayers(box.layers);
  const inserts = box.layers.filter((layer) => layer.role === "insert");
  const covered = structures.length >= 2 && structures[0]?.structure === "sleeve";
  const inner = (covered ? structures[structures.length - 1] : structures[structures.length - 1]) ?? blankLayer(box.structure, box.latch, box.liftOff.neckMm);
  const kept: BoxLayer = { ...inner, role: "structure", structure: box.structure, latch: box.latch };
  if (!on) return [kept, ...inserts];
  const sleeve = covered ? structures[0] : blankLayer("sleeve", "none");
  return [{ ...sleeve, role: "structure", structure: "sleeve", latch: "none" }, kept, ...inserts];
}

export function withSleeveWindow(layers: readonly BoxLayer[], window: SleeveWindow | null): BoxLayer[] {
  return layers.map((layer, index) => (index === 0 && layer.structure === "sleeve" ? { ...layer, window } : layer));
}

/** Millimetres the platform rises at this open amount. Lift-off and book only. */
export function trayLiftMm(structure: string, motion: InsertMotion, openAmount: number, pulled: boolean): number {
  if (structure !== "lift-off" && structure !== "book") return 0;
  if (motion.trayLift.height <= 0) return 0;
  if (motion.trayLift.trigger === "ribbonPull" && !pulled) return 0;
  const amount = Math.min(1, Math.max(0, openAmount));
  return motion.trayLift.height * amount;
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
  if (!box.shape || !inEnum(SHAPE_TYPES, box.shape.type)) issues.push({ path: "shape", message: "enum" });
  else if (box.shape.type === "polygon" && !inRange(box.shape.sides, 3, 12)) issues.push({ path: "shape", message: "sides" });
  if (!Array.isArray(box.layers) || box.layers.length < 1 || box.layers.length > 4) issues.push({ path: "layers", message: "layers" });
  else {
    box.layers.forEach((layer, index) => {
      if (!layer || (layer.role !== "structure" && layer.role !== "insert")) issues.push({ path: `layers.${index}`, message: "role" });
      else if (layer.role === "structure" && !closureById(layer.structure)) issues.push({ path: `layers.${index}`, message: "enum" });
      if (layer && layer.doors !== 1 && layer.doors !== 2) issues.push({ path: `layers.${index}.doors`, message: "doors" });
      if (layer && !inRange(layer.drawerCount, 1, 8)) issues.push({ path: `layers.${index}.drawerCount`, message: "range" });
      if (layer && !inRange(layer.neckHeight, 0, 80)) issues.push({ path: `layers.${index}.neckHeight`, message: "range" });
      if (layer && !inRange(layer.splitPlaneAngle, -180, 180)) issues.push({ path: `layers.${index}.splitPlaneAngle`, message: "range" });
      if (layer?.motion && (typeof layer.motion.type !== "string" || !layer.motion.type)) issues.push({ path: `layers.${index}.motion`, message: "motion" });
    });
  }
  const liftMotion = box.insertMotion;
  if (
    !liftMotion ||
    !inRange(liftMotion.trayLift?.height, TRAY_LIFT_MM[0], TRAY_LIFT_MM[1]) ||
    typeof liftMotion.trayLift?.trigger !== "string" ||
    !liftMotion.trayLift.trigger ||
    typeof liftMotion.pullTab !== "boolean" ||
    typeof liftMotion.extractDirection !== "string" ||
    !inRange(liftMotion.pose?.tiltAngle, -180, 180) ||
    typeof liftMotion.pose?.invert !== "boolean"
  ) {
    issues.push({ path: "insertMotion", message: "insertMotion" });
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
  const namedStructure = typeof named === "string" && named ? named : "";
  let spec = resolveClosure(namedStructure || undefined);
  const wrap = raw.wrap;
  const insert = raw.insert;
  const color = HEX.test(raw.color ?? "") ? raw.color! : "#14161c";
  const width = typeof raw.widthMm === "number" && Number.isFinite(raw.widthMm) ? raw.widthMm : 78;
  const depth = typeof raw.depthMm === "number" && Number.isFinite(raw.depthMm) ? raw.depthMm : 68;
  const height = typeof raw.heightMm === "number" && Number.isFinite(raw.heightMm) ? raw.heightMm : 120;
  const liftOff = resolveLiftOff(raw.liftOff);
  const fallbackLayer = blankLayer(spec.id, resolveLatch(spec, raw.latch), liftOff.neckMm);
  const layers: BoxLayer[] = [];
  let insertNote: InsertLayerNote["insert"] | undefined;
  if (Array.isArray(raw.layers)) {
    for (const item of raw.layers.slice(0, 4)) {
      const resolved = resolveLayer(item, fallbackLayer);
      if ("insert" in resolved) insertNote = resolved.insert;
      else layers.push(resolved);
    }
  }
  if (!layers.length) layers.push({ ...fallbackLayer });
  const inner = innermost(layers) ?? layers[0];
  if (namedStructure) {
    inner.structure = spec.id;
    inner.latch = resolveLatch(spec, raw.latch ?? inner.latch);
  } else if (inner.structure) {
    spec = closureById(inner.structure) ?? spec;
  }
  const latch = inner.latch;
  return {
    variantId: raw.variantId || "box-rigid",
    finish: pickEnum<FinishId>(FINISH_IDS, raw.finish, "matteBlack"),
    color,
    widthMm: clamp(width, BOX_RANGES.widthMm[0], BOX_RANGES.widthMm[1]),
    depthMm: clamp(depth, BOX_RANGES.depthMm[0], BOX_RANGES.depthMm[1]),
    heightMm: clamp(height, BOX_RANGES.heightMm[0], BOX_RANGES.heightMm[1]),
    linked: raw.linked !== false,
    visible: raw.visible === true,
    structure: spec.id,
    latch,
    liftOff,
    drawerPull: resolveDrawerPull(raw.drawerPull),
    shape: resolveShape(raw.shape),
    layers,
    insertMotion: resolveInsertMotion(raw.insertMotion, raw.pullTab === true, insertNote),
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
  const neck = Object.hasOwn(NECKS, design.bottle.neck) ? NECKS[design.bottle.neck] : neckStandard(design.bottle.neck);
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
    actuatorR: typeof pump.radiusFactor === "number" && pump.radiusFactor > 0
      ? Math.max(neckR * pump.radiusFactor, neckR * 0.42)
      : neckR * 0.42,
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
