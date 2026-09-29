export interface StoredCalibration {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1: number;
  k2: number;
  width: number;
  height: number;
  reprojectionPx: number;
  views: number;
  savedAt: string;
}

export function calibrationKey(userAgent: string, screenLabel: string, trackLabel: string, orientation = "up"): string {
  return `perfume-scan-calib:v2:${fnv(userAgent + "|" + screenLabel + "|" + trackLabel + "|" + orientation)}`;
}

export function screenLabel(): string {
  return `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`;
}

export function trackLabel(settings: MediaTrackSettings | null): string {
  if (!settings) return "none";
  const facing = typeof settings.facingMode === "string" ? settings.facingMode : "";
  return `${settings.width ?? 0}x${settings.height ?? 0}@${settings.frameRate ?? 0}|${settings.deviceId ?? ""}|${facing}`;
}

export function readCalibration(key: string): StoredCalibration | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCalibration;
    if (!(parsed.fx > 0) || !(parsed.fy > 0)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCalibration(key: string, value: StoredCalibration) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function clearCalibration(key: string) {
  localStorage.removeItem(key);
}

function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
