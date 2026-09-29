import type { MeasureIssue } from "./scale.ts";
import { SCALE_LIMITS } from "./scale.ts";
import type { PartKind } from "./shape.ts";

export interface ScaleRuleResult {
  issues: MeasureIssue[];
  suspect: boolean;
  saveBlocked: boolean;
  autoRejected: boolean;
}

export function evaluateScaleRule(
  kind: PartKind,
  measuredSizeMm: number,
  hasReferenceObject: boolean,
  hasTypedDimension: boolean,
  hasAuto: boolean,
  manualMillimetres: number | null,
  autoMillimetres: number | null,
): ScaleRuleResult {
  const issues: MeasureIssue[] = [];
  const autoAllowed = (kind === "bottle" || kind === "box") && measuredSizeMm >= SCALE_LIMITS.minimumAutoMillimetres;
  const needsManual = kind === "cap" || kind === "pump" || kind === "collar" || measuredSizeMm < SCALE_LIMITS.minimumAutoMillimetres;
  const hasManual = hasReferenceObject || hasTypedDimension;
  let autoRejected = false;
  if (hasAuto && !autoAllowed) {
    autoRejected = true;
    issues.push({
      code: "scale_auto_not_allowed",
      messageHe: "קנה מידה אוטומטי מותר רק לבקבוק או לקופסה באורך 80 מ״מ ומעלה.",
      messageEn: "Auto scale is only allowed for a bottle or a box at least 80 mm long.",
      blocksSave: !hasManual,
    });
  }
  if (needsManual && !hasManual) {
    issues.push({
      code: "scale_reference_required",
      messageHe: "כובע, משאבה, צווארון או חלק קטן מ־80 מ״מ דורשים אובייקט ייחוס או מידה מוקלדת. השמירה נחסמה.",
      messageEn: "A cap, pump, collar, or any part under 80 mm requires a reference object or a typed dimension. Save is blocked.",
      blocksSave: true,
    });
  } else if (!hasManual && !hasAuto) {
    issues.push({
      code: "scale_reference_required",
      messageHe: "אין מקור קנה מידה. השמירה נחסמה.",
      messageEn: "There is no scale source. Save is blocked.",
      blocksSave: true,
    });
  }
  let suspect = false;
  const autoUsable = hasAuto && autoAllowed;
  if (
    autoUsable && hasManual &&
    manualMillimetres != null && autoMillimetres != null &&
    Number.isFinite(manualMillimetres) && Number.isFinite(autoMillimetres) &&
    Math.abs(manualMillimetres - autoMillimetres) > SCALE_LIMITS.suspectDisagreementMillimetres
  ) {
    suspect = true;
    issues.push({
      code: "scale_suspect",
      messageHe: "המידה האוטומטית והמידה הידנית נבדלות ביותר מ־5 מ״מ.",
      messageEn: "Automatic and manual measurements differ by more than 5 mm.",
      blocksSave: false,
    });
  }
  return { issues, suspect, saveBlocked: issues.some((issue) => issue.blocksSave), autoRejected };
}
