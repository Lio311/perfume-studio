import type { BoxSpec, CollarSpec, PumpSpec } from "./types.ts";

export const PUMPS: PumpSpec[] = [
  { id: "pump-crimp", name: { he: "קרימפ", en: "Crimp pump" }, style: "crimp", actuatorHeightMm: 14, radiusFactor: 0.55, nozzleMm: 4.2, tags: ["crimp", "קרימפ", "standard", "סטנדרט", "pump", "משאבה"], model: { type: "procedural" } },
  { id: "pump-crimp-short", name: { he: "קרימפ נמוך", en: "Short crimp" }, style: "crimp", actuatorHeightMm: 10, radiusFactor: 0.5, nozzleMm: 3.4, tags: ["crimp", "קרימפ", "short", "נמוך"], model: { type: "procedural" } },
  { id: "pump-crimp-tall", name: { he: "קרימפ גבוה", en: "Tall crimp" }, style: "crimp", actuatorHeightMm: 18, radiusFactor: 0.58, nozzleMm: 5, tags: ["crimp", "קרימפ", "tall", "גבוה"], model: { type: "procedural" } },
  { id: "pump-screw", name: { he: "הברגה", en: "Screw pump" }, style: "screw", actuatorHeightMm: 16, radiusFactor: 0.62, nozzleMm: 4.5, tags: ["screw", "הברגה", "בורג"], model: { type: "procedural" } },
  { id: "pump-screw-low", name: { he: "הברגה נמוכה", en: "Low screw" }, style: "screw", actuatorHeightMm: 12, radiusFactor: 0.6, nozzleMm: 3.6, tags: ["screw", "הברגה", "short"], model: { type: "procedural" } },
  { id: "pump-luxury", name: { he: "מעטפת יוקרה", en: "Luxury shroud" }, style: "shroud", actuatorHeightMm: 18, radiusFactor: 0.85, nozzleMm: 3.2, tags: ["luxury", "יוקרה", "shroud", "מעטפת", "collar"], model: { type: "procedural" } },
  { id: "pump-shroud-wide", name: { he: "מעטפת רחבה", en: "Wide shroud" }, style: "shroud", actuatorHeightMm: 15, radiusFactor: 1.05, nozzleMm: 3, tags: ["shroud", "מעטפת", "wide", "רחב", "luxury"], model: { type: "procedural" } },
  { id: "pump-dome", name: { he: "כפתור כיפה", en: "Dome button" }, style: "dome", actuatorHeightMm: 13, radiusFactor: 0.7, nozzleMm: 3.8, tags: ["dome", "כיפה", "button"], model: { type: "procedural" } },
  { id: "pump-flat", name: { he: "דיסק שטוח", en: "Flat disc" }, style: "flat", actuatorHeightMm: 8, radiusFactor: 0.78, nozzleMm: 2.4, tags: ["flat", "שטוח", "disc", "דיסק"], model: { type: "procedural" } },
  { id: "pump-mini", name: { he: "מיני", en: "Mini mist" }, style: "mini", actuatorHeightMm: 9, radiusFactor: 0.42, nozzleMm: 3, tags: ["mini", "מיני"], model: { type: "procedural" } },
  { id: "pump-nozzle", name: { he: "דיזה ארוכה", en: "Long nozzle" }, style: "nozzle", actuatorHeightMm: 12, radiusFactor: 0.52, nozzleMm: 9, tags: ["nozzle", "דיזה", "long"], model: { type: "procedural" } },
  { id: "pump-soft", name: { he: "מגע רך", en: "Soft touch" }, style: "soft", actuatorHeightMm: 15, radiusFactor: 0.66, nozzleMm: 3.5, tags: ["soft", "רך", "touch"], model: { type: "procedural" } },
];

export const COLLARS: CollarSpec[] = [
  { id: "col-thin", name: { he: "קרימפ דק", en: "Thin crimp" }, wallMm: 0.9, heightMm: 6.2, rings: 1, knurl: false, flareMm: 0, tags: ["thin", "דק", "crimp", "קרימפ"], model: { type: "procedural" } },
  { id: "col-crimp", name: { he: "קרימפ", en: "Crimp collar" }, wallMm: 0.475, heightMm: 6.7, rings: 1, knurl: false, flareMm: 0.15, tags: ["crimp", "קרימפ", "standard", "סטנדרט", "ferrule", "פרול"], model: { type: "procedural" } },
  { id: "col-thick", name: { he: "פרול עבה", en: "Thick ferrule" }, wallMm: 2.4, heightMm: 9, rings: 1, knurl: false, flareMm: 0.4, tags: ["thick", "עבה", "ferrule", "פרול"], model: { type: "procedural" } },
  { id: "col-double", name: { he: "טבעת כפולה", en: "Double ring" }, wallMm: 1.5, heightMm: 8.2, rings: 2, knurl: false, flareMm: 0.3, tags: ["double", "כפול", "ring", "טבעת"], model: { type: "procedural" } },
  { id: "col-triple", name: { he: "שלוש טבעות", en: "Triple ring" }, wallMm: 1.4, heightMm: 10, rings: 3, knurl: false, flareMm: 0.2, tags: ["triple", "שלוש", "ring"], model: { type: "procedural" } },
  { id: "col-step", name: { he: "מדרגות", en: "Stepped collar" }, wallMm: 1.8, heightMm: 9.5, rings: 2, knurl: false, flareMm: 1.1, tags: ["step", "מדרגה", "stepped"], model: { type: "procedural" } },
  { id: "col-flare", name: { he: "מתרחב", en: "Flared collar" }, wallMm: 1.3, heightMm: 8, rings: 1, knurl: false, flareMm: 2.2, tags: ["flare", "מתרחב"], model: { type: "procedural" } },
  { id: "col-knurl", name: { he: "מחוספס", en: "Knurled" }, wallMm: 1.7, heightMm: 8.4, rings: 1, knurl: true, flareMm: 0.15, tags: ["knurl", "מחוספס", "grip"], model: { type: "procedural" } },
  { id: "col-flush", name: { he: "שטוח", en: "Flush band" }, wallMm: 1.1, heightMm: 5.4, rings: 0, knurl: false, flareMm: 0, tags: ["flush", "שטוח", "band"], model: { type: "procedural" } },
  { id: "col-crown", name: { he: "כתר", en: "Crown collar" }, wallMm: 2, heightMm: 11, rings: 2, knurl: false, flareMm: 1.6, tags: ["crown", "כתר", "luxury", "יוקרה"], model: { type: "procedural" } },
];

export const BOXES: BoxSpec[] = [
  { id: "box-sleeve", name: { he: "שרוול", en: "Sleeve" }, form: "sleeve", padMm: 14, liftMm: 18, tags: ["sleeve", "שרוול"], model: { type: "procedural" } },
  { id: "box-rigid", name: { he: "מכסה קשיח", en: "Rigid lid" }, form: "rigid", padMm: 16, liftMm: 22, tags: ["rigid", "קשיח", "lid", "מכסה"], model: { type: "procedural" } },
  { id: "box-magnetic", name: { he: "קופסה מגנטית", en: "Magnetic box" }, form: "magnetic", padMm: 18, liftMm: 20, tags: ["magnetic", "מגנטית", "מגנטי"], model: { type: "procedural" } },
  { id: "box-drawer", name: { he: "מגירה", en: "Drawer" }, form: "drawer", padMm: 16, liftMm: 16, tags: ["drawer", "מגירה"], model: { type: "procedural" } },
  { id: "box-tube", name: { he: "גליל אריזה", en: "Tube" }, form: "tube", padMm: 18, liftMm: 24, tags: ["tube", "גליל"], model: { type: "procedural" } },
  { id: "box-plinth", name: { he: "כן", en: "Plinth" }, form: "plinth", padMm: 20, liftMm: 8, tags: ["plinth", "כן", "base"], model: { type: "procedural" } },
  { id: "box-window", name: { he: "חלון", en: "Window box" }, form: "window", padMm: 15, liftMm: 20, tags: ["window", "חלון"], model: { type: "procedural" } },
  { id: "box-coffret", name: { he: "קופרה", en: "Coffret" }, form: "coffret", padMm: 22, liftMm: 26, tags: ["coffret", "קופרה", "gift"], model: { type: "procedural" } },
];
