/** Closed carton shot, xz before normalize. The tube mark faces this same azimuth. */
export const BOX_CLOSED_CAM_X = 0.72;
export const BOX_CLOSED_CAM_Y = 0.46;
export const BOX_CLOSED_CAM_Z = 1;

/** Azimuth of the closed shot. Cylinder theta 0 is +Z and grows toward +X. */
export const BOX_CLOSED_MARK_AZIMUTH = Math.atan2(BOX_CLOSED_CAM_X, BOX_CLOSED_CAM_Z);
