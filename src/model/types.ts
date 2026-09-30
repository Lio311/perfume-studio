export type Lang = "he" | "en";

export type NeckId = "FEA13" | "FEA15" | "FEA17" | "FEA18" | "FEA20";

export type SectionKind =
  | "circle"
  | "oval"
  | "squircle"
  | "rect"
  | "diamond"
  | "hex"
  | "oct"
  | "pebble";

export type ProfileName =
  | "cara"
  | "classic"
  | "column"
  | "pebble"
  | "sphere"
  | "bell"
  | "amphora"
  | "barrel"
  | "cone"
  | "flask"
  | "highShoulder"
  | "lowShoulder"
  | "stepped"
  | "gem"
  | "slim"
  | "arched"
  | "disc";

export type FinishId =
  | "clear"
  | "frosted"
  | "tinted"
  | "gold"
  | "silver"
  | "rose"
  | "matteBlack"
  | "wood"
  | "leather"
  | "fabric";

export type VariantPart = "bottle" | "cap" | "label" | "pump" | "collar" | "box";

export type PartKey = VariantPart | "liquid";

/** Procedural today. Set `glb` to a URL later and the mesh loader will use it. */
export type ModelSource = { type: "procedural" } | { type: "glb"; url: string };

export type Localized = { he: string; en: string };

export interface SupplierMeta {
  name: string;
  ref?: string;
  capacityMl?: number;
  origin?: string;
}

export interface BottleSpec {
  id: string;
  name: Localized;
  section: SectionKind;
  profile: ProfileName;
  /** Fraction of height used to ease the shoulder into the neck. */
  shoulder: number;
  /**
   * Straight glass under the lip, in millimetres.
   * Steep bulbs store about one neck radius. Other bottles store the crimp seat.
   */
  finishMm?: number;
  heightMm: number;
  widthMm: number;
  depthMm: number;
  neck: NeckId;
  /** 0 sharp corners, 1 rounder. Applies to rect / squircle / diamond. */
  softness: number;
  faceted: boolean;
  tags: string[];
  supplier?: SupplierMeta;
  model: ModelSource;
  capacityMl: number;
}

export interface CapSpec {
  id: string;
  name: Localized;
  section: SectionKind;
  profile: CapProfileName;
  heightMm: number;
  widthMm: number;
  depthMm: number;
  overhangMm: number;
  softness: number;
  faceted: boolean;
  tags: string[];
  model: ModelSource;
}

export type CapProfileName =
  | "cylinder"
  | "dome"
  | "sphere"
  | "puck"
  | "cone"
  | "bell"
  | "obelisk"
  | "taper"
  | "magnetic"
  | "mushroom"
  | "facet"
  | "crystal"
  | "woodstop"
  | "cube"
  | "arch"
  | "bullet";

export type LogoPlate = "plaque" | "tall" | "circle" | "diamond" | "band" | "arch" | "square" | "slim";
export type LogoMark =
  | "monogram"
  | "double"
  | "word"
  | "vertical"
  | "stacked"
  | "seal"
  | "droplet"
  | "diamond"
  | "sun"
  | "wave"
  | "crest"
  | "star"
  | "deco"
  | "horizon"
  | "laurel"
  | "dots"
  | "chevron"
  | "oval"
  | "numeral"
  | "bars";
export type LogoApplication = "decal" | "engrave" | "emboss" | "foil";
export type LogoFont = "cormorant" | "cinzel" | "italiana" | "vibes" | "heebo";
export type LogoFrame = "none" | "hairline" | "double" | "corners" | "circle" | "laurel";

export interface LogoSpec {
  id: string;
  name: Localized;
  plate: LogoPlate;
  mark: LogoMark;
  application: LogoApplication;
  font: LogoFont;
  frame: LogoFrame;
  tags: string[];
  model: ModelSource;
  /** Set on supplier imports so the decal uses real millimetres. */
  widthMm?: number;
  heightMm?: number;
}

export type PumpStyle =
  | "crimp"
  | "screw"
  | "shroud"
  | "dome"
  | "flat"
  | "mini"
  | "nozzle"
  | "soft";

export interface PumpSpec {
  id: string;
  name: Localized;
  style: PumpStyle;
  actuatorHeightMm: number;
  /**
   * Button radius as a fraction of the neck radius.
   * Omitted when the catalog does not size the head.
   */
  radiusFactor?: number;
  /** Button diameter in millimetres. Wins over radiusFactor. */
  widthMm?: number;
  nozzleMm: number;
  tags: string[];
  model: ModelSource;
}

export interface CollarSpec {
  id: string;
  name: Localized;
  wallMm: number;
  heightMm: number;
  rings: number;
  knurl: boolean;
  flareMm: number;
  /** Crimp button radius as a fraction of the neck radius, when the pump sets neither a width nor a factor. */
  radiusFactor?: number;
  tags: string[];
  model: ModelSource;
}

export type BoxForm =
  | "sleeve"
  | "rigid"
  | "magnetic"
  | "drawer"
  | "gatefold"
  | "tube"
  | "plinth"
  | "window"
  | "coffret";

export interface BoxSpec {
  id: string;
  name: Localized;
  form: BoxForm;
  padMm: number;
  liftMm: number;
  tags: string[];
  model: ModelSource;
}

export interface BottleState {
  variantId: string;
  neck: NeckId;
  finish: FinishId;
  color: string;
  heightMm: number;
  widthMm: number;
  depthMm: number;
  opacity?: number | null;
  visible: boolean;
}

export interface CapState {
  variantId: string;
  finish: FinishId;
  color: string;
  heightMm: number;
  widthMm: number;
  visible: boolean;
}

export interface LabelState {
  variantId: string;
  finish: FinishId;
  color: string;
  text: string;
  scale: number;
  visible: boolean;
  /** Overrides the catalog finish for this design. Missing means use the logo spec. */
  application?: LogoApplication;
}

export interface PumpState {
  variantId: string;
  finish: FinishId;
  color: string;
  visible: boolean;
}

export interface CollarState {
  variantId: string;
  finish: FinishId;
  color: string;
  visible: boolean;
}

/**
 * Structure id. The registry in `src/model/closures/` is the list, not a union in this file.
 * A magnet is a latch, not one of these ids.
 */
export type BoxStructure = string;

/** How the carton stays shut. Magnet is valid only on the structures that say so. */
export type BoxLatch = "magnet" | "ribbon" | "none";

/** Lift-off variant id. Legal values live on the lift-off registry entry. */
export type LiftOffVariant = string;

export interface LiftOffState {
  /** shoulder-neck, telescope-full, or telescope-partial. */
  variant: LiftOffVariant;
  /** Visible inner neck between the lid and the base, millimetres. Shoulder-neck uses this. */
  neckMm: number;
  /** How far the lid comes down, millimetres. */
  lidDepthMm: number;
}

/** Matchbox drawer pull. None, a ribbon loop, or a thumb notch. */
export type DrawerPull = "none" | "ribbon" | "notch";

/** Plan shape. Rect is built. Cylinder is built for lift-off. Polygon is stored and drawn as a rect until a later entry. */
export type BoxShapeType = "rect" | "cylinder" | "polygon";

export interface BoxShape {
  type: BoxShapeType;
  /** Polygon only. Hexagon is 6, octagon is 8. */
  sides?: number;
}

/** Opening in a sleeve. Shape is open so a later cutout does not need a migration. */
export interface SleeveWindow {
  shape: string;
  transparent: boolean;
}

/**
 * Motion a future entry can declare (unfold, rotate, flaps).
 * The pose loop does not switch on `type`; the entry owns the meaning of `params`.
 */
export interface StructureMotion {
  type: string;
  params: Record<string, number | string | boolean | ReadonlyArray<number | string>>;
}

/** One outer-to-inner layer. A structure layer is a registry entry. An insert layer is the platform. */
export interface BoxLayer {
  role: "structure" | "insert";
  structure: string;
  latch: BoxLatch;
  hingeAxis: string;
  doors: 1 | 2;
  drawerCount: number;
  direction: string;
  /** Shoulder-neck band, millimetres. The lift-off slider writes the same value. */
  neckHeight: number;
  /** Degrees. Zero is a level lid seam. */
  splitPlaneAngle: number;
  window: SleeveWindow | null;
  motion: StructureMotion | null;
}

export interface TrayLift {
  /** Rise in millimetres. Zero stays put. */
  height: number;
  /** lidAngle follows the lid. ribbonPull waits for a pull tab or ribbon. */
  trigger: string;
}

export interface InsertPose {
  tiltAngle: number;
  invert: boolean;
}

export interface InsertMotion {
  trayLift: TrayLift;
  pullTab: boolean;
  extractDirection: string;
  pose: InsertPose;
}

export type BoxBoard = "rigid" | "carton";

export type WrapFinish = "matte" | "gloss" | "soft-touch" | "velvet" | "paper-texture";

export type OuterWrap = "none" | "cellophane" | "sleeve" | "tissue";

export type InsertMaterial = "eva" | "pulp" | "card" | "velvet-foam";

export type InsertOrientation = "standing" | "lying";

export interface BoxWrap {
  color: string;
  finish: WrapFinish;
}

export interface BoxInsert {
  material: InsertMaterial;
  orientation: InsertOrientation;
  clearanceMm: number;
}

export interface BoxState {
  variantId: string;
  finish: FinishId;
  color: string;
  /** Outer size in millimetres. Ignored while `linked` derives the carton from the insert. */
  heightMm: number;
  widthMm: number;
  depthMm: number;
  linked: boolean;
  visible: boolean;
  /** Inner structure: lift-off, tube, hinged lid, sleeve, drawer, book, or a later registry id. */
  structure: BoxStructure;
  latch: BoxLatch;
  liftOff: LiftOffState;
  drawerPull: DrawerPull;
  /** Rect, cylinder, or polygon. Polygon renders as a rect until that entry exists. */
  shape: BoxShape;
  /** Outer to inner. A leading sleeve slides off the inner box. `tube` is a round canister. */
  layers: BoxLayer[];
  insertMotion: InsertMotion;
  /** Greyboard / carton caliper. */
  boardMm: number;
  material: BoxBoard;
  wrap: BoxWrap;
  ribbon: boolean;
  pullTab: boolean;
  outerWrap: OuterWrap;
  insert: BoxInsert;
}

export interface LiquidState {
  color: string;
  fill: number;
  visible: boolean;
}

export interface Design {
  bottle: BottleState;
  cap: CapState;
  label: LabelState;
  pump: PumpState;
  collar: CollarState;
  box: BoxState;
  liquid: LiquidState;
  step?: number;
}
