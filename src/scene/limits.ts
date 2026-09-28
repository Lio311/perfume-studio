/** Shared with the floor fog and the callout layer. CameraRig writes these each frame. */
export const sceneSpan = {
  radius: 48,
  flying: false,
};

/** Dev-server probe so a headless check can read the live camera. */
export const cameraProbe = {
  x: 0,
  y: 0,
  z: 0,
  tx: 0,
  ty: 0,
  tz: 0,
  finite: true,
  flying: false,
  sig: "",
};
