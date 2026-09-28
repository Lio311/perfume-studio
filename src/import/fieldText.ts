/** First Strong Isolate / Pop Directional Isolate. For names and numbers whose direction follows the text. */
export function bdi(value: string | number): string {
  return `\u2068${value}\u2069`;
}

/** Left-to-Right Isolate / Pop Directional Isolate. Codes and ids are always left to right. */
export function ltr(value: string | number): string {
  return `\u2066${value}\u2069`;
}

/** Labels for pack fields. English labels start a sentence. */
export const FIELD_LABEL = {
  he: {
    widthMm: "רוחב",
    heightMm: "גובה",
    depthMm: "עומק",
    capacityMl: "נפח",
    neck: "צוואר",
    code: "קוד",
    id: "מזהה",
    name: "שם",
    kind: "סוג",
    profile: "פרופיל",
    color: "צבע",
    thumb: "תמונה",
    page: "עמוד",
    lathe: "חריטה",
    minQty: "כמות מינימלית",
    moq: "כמות הזמנה מינימלית",
    createdAt: "תאריך יצירה",
    version: "גרסה",
    source: "מקור",
    supplier: "ספק",
  },
  en: {
    widthMm: "Width",
    heightMm: "Height",
    depthMm: "Depth",
    capacityMl: "Volume",
    neck: "Neck",
    code: "Code",
    id: "Id",
    name: "Name",
    kind: "Kind",
    profile: "Profile",
    color: "Color",
    thumb: "Thumb",
    page: "Page",
    lathe: "Lathe",
    minQty: "Minimum quantity",
    moq: "Minimum order quantity",
    createdAt: "Created date",
    version: "Version",
    source: "Source",
    supplier: "Supplier",
  },
} as const;

export type FieldLabelKey = keyof typeof FIELD_LABEL.he;
