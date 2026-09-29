export type CameraFailure = "insecure" | "denied" | "missing" | "unavailable";

export function cameraBlocker(): CameraFailure | null {
  if (typeof window === "undefined") return "unavailable";
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return "insecure";
  return null;
}

export async function openRearCamera(): Promise<{ stream: MediaStream; settings: MediaTrackSettings } | { error: CameraFailure }> {
  const blocked = cameraBlocker();
  if (blocked) return { error: blocked };
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
    { audio: false, video: { facingMode: { ideal: "environment" } } },
    { audio: false, video: true },
  ];
  let last: unknown = null;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getVideoTracks()[0];
      if (!track) {
        stream.getTracks().forEach((item) => item.stop());
        return { error: "missing" };
      }
      return { stream, settings: track.getSettings() };
    } catch (error) {
      last = error;
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) return { error: "denied" };
      if (error instanceof DOMException && error.name === "NotFoundError") return { error: "missing" };
    }
  }
  if (last instanceof DOMException && last.name === "NotAllowedError") return { error: "denied" };
  if (last instanceof DOMException && (last.name === "NotFoundError" || last.name === "OverconstrainedError")) return { error: "missing" };
  return { error: "unavailable" };
}
