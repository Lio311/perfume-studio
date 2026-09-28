/** Idle parts damp toward this fraction of full visibility. */
export const GHOST_FADE = 0.1;

export interface OpacityFadeState {
  /** Opacity (or shader fade) the material should show when it is not ghosted. */
  baseOpacity?: number;
  /** Last opacity setting published by the control. Absent for materials that are not slider-driven. */
  opacitySetting?: number;
}

/**
 * Per-frame ghost fade composed with the material's current opacity.
 *
 * Slider-driven materials publish `opacitySetting`. That base follows the
 * setting whenever it changes, instead of being snapshotted on the first frame,
 * and the ghost fade multiplies it. Other materials keep the original fade:
 * a one-time base, restored when idle, and an absolute ghost target of 0.1.
 */
export function materialOpacityTarget(
  state: OpacityFadeState,
  opacitySetting: number | undefined,
  liveValue: number,
  ghost: boolean,
): { baseOpacity: number; opacitySetting?: number; target: number } {
  if (opacitySetting === undefined) {
    const droppedSetting = state.opacitySetting !== undefined;
    const baseOpacity = state.baseOpacity === undefined || droppedSetting ? liveValue : state.baseOpacity;
    return { baseOpacity, target: ghost ? GHOST_FADE : baseOpacity };
  }
  const baseOpacity = state.baseOpacity === undefined || state.opacitySetting !== opacitySetting
    ? opacitySetting
    : state.baseOpacity;
  return {
    baseOpacity,
    opacitySetting,
    target: baseOpacity * (ghost ? GHOST_FADE : 1),
  };
}
