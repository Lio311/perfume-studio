/** Schema lathe samples: base to top, 1 = widest radius. 42 values, clamped like ProfileExtractor. */

export function bottleLathe(): number[] {
  return Array.from({ length: 42 }, (_, index) => {
    const t = index / 41;
    if (t < 0.08) return 0.72 + (0.28 * t) / 0.08;
    if (t < 0.7) return 1;
    if (t < 0.84) return 1 - (0.64 * (t - 0.7)) / 0.14;
    return 0.36;
  });
}

export function capLathe(): number[] {
  return Array.from({ length: 42 }, (_, index) => {
    const t = index / 41;
    if (t < 0.78) return 1;
    const u = (t - 0.78) / 0.22;
    return Math.max(0.16, Math.cos((u * Math.PI) / 2));
  });
}

/** Sphere ends. Classification uses the unsmoothed silhouette; this is the profile that is revolved. */
export function sphereLathe(): number[] {
  return Array.from({ length: 42 }, (_, index) => {
    const t = index / 41;
    return Math.max(0.04, Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)));
  });
}

export const REVOLVE_PROFILES = [
  { name: "bottle", heightMm: 100, radiusMm: 20, samples: bottleLathe },
  { name: "cap", heightMm: 25, radiusMm: 15, samples: capLathe },
  { name: "sphere", heightMm: 52, radiusMm: 26, samples: sphereLathe },
] as const;
