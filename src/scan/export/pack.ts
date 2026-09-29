import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schemaText from "../../../schema/supplier-pack.schema.json?raw";
import type { PartKind } from "../packkit/shape.ts";

const validate = (() => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addFormat("date", (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
  return ajv.compile(JSON.parse(schemaText) as object);
})();

export interface ScanMeasurement {
  key: string;
  value: number;
  source: string;
  toleranceMm?: number;
}

export interface ScanPackInput {
  id: string;
  supplierName: string;
  createdAt: number;
  kind: PartKind;
  code: string;
  partName: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  profile: string;
  color: string;
  lathe?: number[] | null;
  measurements?: ScanMeasurement[];
  method?: string;
  capturedAt: string;
  device?: string | null;
  referenceObject?: string | null;
  confidence?: number | null;
  priceValue?: number | null;
  currency?: string | null;
  /** Calendar date `YYYY-MM-DD`. The schema `quotedAt` format is `date`. */
  quotedAt?: string | null;
}

export interface ScanPackResult {
  pack: Record<string, unknown>;
  text: string;
  ok: boolean;
  errors: string;
}

export function buildScanPack(input: ScanPackInput): ScanPackResult {
  const part: Record<string, unknown> = {
    id: `${input.id}-${slug(input.code)}`,
    kind: input.kind,
    code: input.code,
    name: input.partName,
    neck: null,
    widthMm: roundMm(input.widthMm),
    heightMm: roundMm(input.heightMm),
    depthMm: roundMm(input.depthMm),
    capacityMl: null,
    profile: input.profile,
    color: input.color,
    thumb: "",
    page: 1,
    source: "scan",
  };
  if (input.lathe && input.lathe.length >= 4) part.lathe = input.lathe.map((sample) => Math.min(1.2, Math.max(0.04, sample)));
  if (input.measurements?.length) {
    part.measurements = input.measurements.map((item) => ({
      key: item.key,
      value: item.value,
      source: item.source,
      ...(item.toleranceMm != null ? { toleranceMm: item.toleranceMm } : {}),
    }));
  }
  const scan: Record<string, unknown> = {
    method: input.method ?? (input.kind === "box" || input.kind === "label" ? "single-photo" : "photo-lathe"),
    capturedAt: input.capturedAt,
    scale: "reference-card",
    referenceObject: input.referenceObject ?? "ISO/IEC 7810 ID-1 card 85.60x53.98mm",
    dimsVerifiedBySupplier: false,
    toleranceMm: 5,
  };
  if (input.device) scan.device = input.device;
  if (input.confidence != null) scan.confidence = input.confidence;
  part.scan = scan;
  if (input.priceValue != null && input.priceValue > 0 && input.currency && input.quotedAt) {
    part.price = {
      value: input.priceValue,
      currency: input.currency.toUpperCase(),
      quotedAt: input.quotedAt,
    };
  }
  const pack: Record<string, unknown> = {
    id: input.id,
    name: input.supplierName,
    createdAt: input.createdAt,
    version: 2,
    source: "scan",
    generator: {
      name: "Perfume Studio Scanner (Web)",
      version: "1.0.0",
      exportedAt: input.capturedAt,
    },
    parts: [part],
  };
  const range = dimensionError(input.kind, input.widthMm, input.heightMm, input.depthMm);
  const schemaOk = validate(pack) === true;
  const errors = [range, schemaOk ? "" : JSON.stringify(validate.errors)].filter(Boolean).join(" ");
  return { pack, text: JSON.stringify(pack, null, 2), ok: schemaOk && range === "", errors };
}

export function todayDate(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function roundMm(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Same inclusive millimetre bounds as the configurator importer (`packValidate` MM). */
const PART_MM: Record<PartKind, { widthMm: readonly [number, number]; heightMm: readonly [number, number]; depthMm: readonly [number, number] }> = {
  bottle: { widthMm: [26, 96], heightMm: [48, 180], depthMm: [20, 90] },
  cap: { widthMm: [16, 48], heightMm: [10, 78], depthMm: [16, 48] },
  box: { widthMm: [40, 160], heightMm: [70, 240], depthMm: [30, 140] },
  pump: { widthMm: [8, 48], heightMm: [8, 18], depthMm: [8, 48] },
  collar: { widthMm: [8, 48], heightMm: [5, 12], depthMm: [8, 48] },
  label: { widthMm: [8, 160], heightMm: [8, 160], depthMm: [0, 160] },
};

function dimensionError(kind: PartKind, widthMm: number, heightMm: number, depthMm: number): string {
  const ranges = PART_MM[kind];
  const values = { widthMm, heightMm, depthMm };
  for (const field of ["widthMm", "heightMm", "depthMm"] as const) {
    const [min, max] = ranges[field];
    if (values[field] < min || values[field] > max) return `${field} must be between ${min} and ${max}`;
  }
  return "";
}

function slug(code: string): string {
  const cleaned = code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "part";
}
