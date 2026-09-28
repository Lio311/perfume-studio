/** First Strong Isolate / Pop Directional Isolate. Keeps a code or number in order inside Hebrew. */
export function bdi(value: string | number): string {
  return `\u2068${value}\u2069`;
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
  },
} as const;

export type FieldLabelKey = keyof typeof FIELD_LABEL.he;
