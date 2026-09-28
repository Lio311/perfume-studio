/** True when a canvas can create a WebGL context. A throw or a null context is unavailable. */
export function canvasHasWebgl(getContext: (kind: string) => unknown): boolean {
  try {
    return Boolean(getContext("webgl2") || getContext("webgl"));
  } catch {
    return false;
  }
}

export function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const ok = canvasHasWebgl((kind) => canvas.getContext(kind));
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return ok;
  } catch {
    return false;
  }
}
