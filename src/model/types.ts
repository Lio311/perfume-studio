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
  | "leather";

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
  radiusFactor: number;
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
  tags: string[];
  model: ModelSource;
}

export type BoxForm =
  | "sleeve"
  | "rigid"
  | "magnetic"
  | "drawer"
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

export interface BoxState {
  variantId: string;
  finish: FinishId;
  color: string;
  heightMm: number;
  widthMm: number;
  depthMm: number;
  linked: boolean;
  visible: boolean;
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
}
