export interface OrbitState {
  yaw: number;
  pitch: number;
  distance: number;
  panX: number;
  panY: number;
}

/**
 * One finger rotates. Two fingers pinch to zoom and pan.
 * Pointer events cover iPhone Safari and a desktop trackpad without a 300 ms delay.
 */
export function attachOrbit(element: HTMLElement, state: OrbitState, limits: { min: number; max: number }, onChange: () => void): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let last: { x: number; y: number; spread: number; midX: number; midY: number } | null = null;

  function snapshot() {
    const points = [...pointers.values()];
    if (!points.length) return null;
    if (points.length === 1) return { x: points[0].x, y: points[0].y, spread: 0, midX: points[0].x, midY: points[0].y };
    const midX = (points[0].x + points[1].x) / 2;
    const midY = (points[0].y + points[1].y) / 2;
    const spread = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    return { x: midX, y: midY, spread, midX, midY };
  }

  function down(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    element.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    last = snapshot();
  }

  function move(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = snapshot();
    if (!last || !next) {
      last = next;
      return;
    }
    if (pointers.size >= 2 && last.spread > 8 && next.spread > 8) {
      state.distance = clamp(state.distance * (last.spread / next.spread), limits.min, limits.max);
      const scale = state.distance * 0.0011;
      state.panX -= (next.midX - last.midX) * scale;
      state.panY += (next.midY - last.midY) * scale;
    } else if (pointers.size === 1) {
      state.yaw -= (next.x - last.x) * 0.008;
      state.pitch = clamp(state.pitch + (next.y - last.y) * 0.008, -1.15, 1.15);
    }
    last = next;
    onChange();
  }

  function up(event: PointerEvent) {
    pointers.delete(event.pointerId);
    last = snapshot();
  }

  function menu(event: Event) {
    event.preventDefault();
  }

  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
  element.addEventListener("contextmenu", menu);
  return () => {
    element.removeEventListener("pointerdown", down);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", up);
    element.removeEventListener("pointercancel", up);
    element.removeEventListener("contextmenu", menu);
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
