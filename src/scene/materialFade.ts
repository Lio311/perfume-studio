/** Ghosted parts settle at this opacity, or higher when the part itself is stronger. */
export const GHOST_FADE = 0.1;

export interface OpacityFadeState {
  /** Opacity (or shader fade) the material should show when it is not ghosted. */
  baseOpacity?: number;
}

/** Same curve as THREE.MathUtils.damp, kept here so the frame step can be tested without a renderer. */
export function dampOpacity(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/**
 * Bottle glass, every frame. The design's current setting is the base.
 * A ghost uses a fraction of that opacity and never drops below {@link GHOST_FADE}.
 */
export function glassOpacityThisFrame(
  setting: number,
  ghost: boolean,
): { baseOpacity: number; target: number } {
  const baseOpacity = setting;
  return { baseOpacity, target: ghost ? Math.max(GHOST_FADE, baseOpacity * GHOST_FADE) : baseOpacity };
}

/**
 * Per-frame ghost fade for materials that are not bottle glass.
 * The base is snapshotted once, restored when idle, and the ghost target is 0.1.
 */
export function materialOpacityTarget(
  state: OpacityFadeState,
  liveValue: number,
  ghost: boolean,
): { baseOpacity: number; target: number } {
  const baseOpacity = state.baseOpacity === undefined ? liveValue : state.baseOpacity;
  return { baseOpacity, target: ghost ? GHOST_FADE : baseOpacity };
}

export interface BottleGlassMaterial {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  userData: { baseOpacity?: number };
  uniforms?: { uFade?: { value: number } };
}

/**
 * One frame of the bottle-glass fade used by PartShell.
 * The first write snaps to the design value. Depth write stays off and the
 * material stays transparent for the whole slider, including opacity 1, so the
 * front wall never drops the liquid from the depth test. Opacity itself fades
 * the picture out.
 * Returns false when this material is not the bottle-glass body.
 */
export function writeBottleGlassFrame(
  mat: BottleGlassMaterial,
  glassSetting: { fade: number | null; alpha: number | null },
  ghost: boolean,
  dt: number,
): boolean {
  const shaderFade = mat.uniforms?.uFade;
  const setting = shaderFade && glassSetting.fade !== null ? glassSetting.fade : glassSetting.alpha;
  if (setting === null) return false;
  const firstWrite = typeof mat.userData.baseOpacity !== "number";
  const resolved = glassOpacityThisFrame(setting, ghost);
  mat.userData.baseOpacity = resolved.baseOpacity;
  if (shaderFade && glassSetting.fade !== null) {
    const next = firstWrite ? resolved.target : dampOpacity(shaderFade.value, resolved.target, 7, dt);
    if (Math.abs(shaderFade.value - next) > 0.001) shaderFade.value = next;
    mat.transparent = true;
    mat.depthWrite = false;
    return true;
  }
  const next = firstWrite ? resolved.target : dampOpacity(mat.opacity, resolved.target, 7, dt);
  if (Math.abs(mat.opacity - next) > 0.001) mat.opacity = next;
  mat.transparent = true;
  mat.depthWrite = false;
  return true;
}
