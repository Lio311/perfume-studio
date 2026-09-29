/**
 * Stable card-distance guide.
 *
 * The native PackKit guide (median of five, then EMA α = 0.25, then an
 * immediate band threshold) changes state on a single noisy frame. This one
 * does not. The numbers below are the contract the unit tests lock in.
 *
 * - `oneEuro` / `tiltEuro` — One Euro filter (Casiez et al.). `minCutoff` is
 *   the low-speed cutoff in Hz, `beta` raises the cutoff as the signal speeds
 *   up, `dCutoff` smooths the derivative. Higher `minCutoff` follows faster
 *   and filters less.
 * - `targetMm` — the distance the operator is asked to hold.
 * - `okEnterMm` / `okExitMm` — hysteresis. OK is entered only when
 *   |Z − target| ≤ okEnterMm and left only when |Z − target| > okExitMm.
 *   too-close and too-far exchange only past `okExitMm`, so a reading that
 *   sits in the gap does not flip.
 * - `dwellMs` — a new band is shown only after it has been the candidate for
 *   this long. A one-frame spike cannot change the band.
 * - `holdMs` — when the card disappears, the last filtered reading stays on
 *   screen, flagged `held`, for this long (700 ms) before the guide reports
 *   `lost`.
 * - `uiIntervalMs` — `publish` stays false between paints unless the band or
 *   the held flag changed.
 */
export const DISTANCE_GUIDE_PARAMS = {
  oneEuro: { minCutoff: 1.2, beta: 0.007, dCutoff: 1 },
  tiltEuro: { minCutoff: 0.8, beta: 0.003, dCutoff: 1 },
  targetMm: 220,
  okEnterMm: 12,
  okExitMm: 22,
  dwellMs: 280,
  holdMs: 700,
  uiIntervalMs: 100,
} as const;

export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

export type DistanceBand = "too-close" | "ok" | "too-far";

export interface DistanceGuideParams {
  oneEuro: OneEuroParams;
  tiltEuro: OneEuroParams;
  targetMm: number;
  okEnterMm: number;
  okExitMm: number;
  dwellMs: number;
  holdMs: number;
  uiIntervalMs: number;
}

export interface DistanceSample {
  timeMs: number;
  distanceMm: number | null;
  tiltDeg?: number | null;
}

export interface DistanceFrame {
  band: DistanceBand | "lost";
  held: boolean;
  distanceMm: number | null;
  distanceCm: number | null;
  tiltDeg: number | null;
  hint: "closer" | "farther" | "hold" | "none";
  publish: boolean;
}

export function createOneEuro(params: OneEuroParams) {
  let xHat: number | null = null;
  let dxHat = 0;
  let lastTime: number | null = null;
  return {
    reset() {
      xHat = null;
      dxHat = 0;
      lastTime = null;
    },
    filter(value: number, timeMs: number) {
      if (xHat == null || lastTime == null) {
        xHat = value;
        dxHat = 0;
        lastTime = timeMs;
        return value;
      }
      const dt = Math.max(1e-3, (timeMs - lastTime) / 1000);
      lastTime = timeMs;
      const dx = (value - xHat) / dt;
      const alphaD = smoothingAlpha(params.dCutoff, dt);
      dxHat = alphaD * dx + (1 - alphaD) * dxHat;
      const cutoff = params.minCutoff + params.beta * Math.abs(dxHat);
      const a = smoothingAlpha(cutoff, dt);
      xHat = a * value + (1 - a) * xHat;
      return xHat;
    },
  };
}

function smoothingAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * Math.max(cutoff, 1e-6));
  return 1 / (1 + tau / dt);
}

export function createDistanceGuide(overrides: Partial<DistanceGuideParams> = {}) {
  const params: DistanceGuideParams = {
    ...DISTANCE_GUIDE_PARAMS,
    ...overrides,
    oneEuro: { ...DISTANCE_GUIDE_PARAMS.oneEuro, ...overrides.oneEuro },
    tiltEuro: { ...DISTANCE_GUIDE_PARAMS.tiltEuro, ...overrides.tiltEuro },
  };
  const distanceFilter = createOneEuro(params.oneEuro);
  const tiltFilter = createOneEuro(params.tiltEuro);
  let band: DistanceBand | null = null;
  let candidate: DistanceBand | null = null;
  let candidateSince = 0;
  let lastGoodAt: number | null = null;
  let lastDistance: number | null = null;
  let lastTilt: number | null = null;
  let lastPublishAt = Number.NEGATIVE_INFINITY;
  let publishedBand: DistanceFrame["band"] | null = null;
  let publishedHeld: boolean | null = null;

  function desired(z: number): DistanceBand {
    const error = z - params.targetMm;
    const magnitude = Math.abs(error);
    if (band === "ok") {
      if (magnitude <= params.okExitMm) return "ok";
      return error < 0 ? "too-close" : "too-far";
    }
    if (band === "too-close") {
      if (magnitude <= params.okEnterMm) return "ok";
      if (error > params.okExitMm) return "too-far";
      return "too-close";
    }
    if (band === "too-far") {
      if (magnitude <= params.okEnterMm) return "ok";
      if (error < -params.okExitMm) return "too-close";
      return "too-far";
    }
    if (magnitude <= params.okEnterMm) return "ok";
    return error < 0 ? "too-close" : "too-far";
  }

  function commit(next: DistanceBand, timeMs: number) {
    if (band == null) {
      band = next;
      candidate = next;
      candidateSince = timeMs;
      return;
    }
    if (next === band) {
      candidate = next;
      candidateSince = timeMs;
      return;
    }
    if (candidate !== next) {
      candidate = next;
      candidateSince = timeMs;
      return;
    }
    if (timeMs - candidateSince >= params.dwellMs) band = next;
  }

  return {
    reset() {
      distanceFilter.reset();
      tiltFilter.reset();
      band = null;
      candidate = null;
      candidateSince = 0;
      lastGoodAt = null;
      lastDistance = null;
      lastTilt = null;
      lastPublishAt = Number.NEGATIVE_INFINITY;
      publishedBand = null;
      publishedHeld = null;
    },
    push(sample: DistanceSample): DistanceFrame {
      let held = false;
      let shown: DistanceBand | "lost" = "lost";
      let distance = lastDistance;
      let tilt = lastTilt;
      if (sample.distanceMm != null && Number.isFinite(sample.distanceMm) && sample.distanceMm > 0) {
        distance = distanceFilter.filter(sample.distanceMm, sample.timeMs);
        tilt = sample.tiltDeg == null || !Number.isFinite(sample.tiltDeg) ? lastTilt : tiltFilter.filter(sample.tiltDeg, sample.timeMs);
        lastGoodAt = sample.timeMs;
        lastDistance = distance;
        lastTilt = tilt;
        commit(desired(distance), sample.timeMs);
        shown = band ?? "lost";
      } else if (lastGoodAt != null && sample.timeMs - lastGoodAt < params.holdMs && band) {
        held = true;
        shown = band;
        distance = lastDistance;
        tilt = lastTilt;
      } else {
        distanceFilter.reset();
        tiltFilter.reset();
        band = null;
        candidate = null;
        lastDistance = null;
        lastTilt = null;
        lastGoodAt = null;
        shown = "lost";
        distance = null;
        tilt = null;
      }
      const hint = hintFor(shown, held, distance, params.targetMm);
      const changed = shown !== publishedBand || held !== publishedHeld;
      const due = sample.timeMs - lastPublishAt >= params.uiIntervalMs;
      const publish = changed || due;
      if (publish) {
        lastPublishAt = sample.timeMs;
        publishedBand = shown;
        publishedHeld = held;
      }
      return {
        band: shown,
        held,
        distanceMm: distance,
        distanceCm: distance == null ? null : roundCm(distance),
        tiltDeg: tilt,
        hint,
        publish,
      };
    },
  };
}

function hintFor(
  band: DistanceBand | "lost",
  held: boolean,
  distance: number | null,
  target: number,
): DistanceFrame["hint"] {
  if (held) return "hold";
  if (band === "lost" || distance == null || band === "ok") return "none";
  return distance > target ? "closer" : "farther";
}

function roundCm(mm: number): number {
  const centimetres = mm / 10;
  const sign = centimetres < 0 ? -1 : 1;
  return (sign * Math.floor(Math.abs(centimetres) * 10 + 0.5)) / 10;
}
