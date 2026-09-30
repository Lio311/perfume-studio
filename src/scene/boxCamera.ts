/** Closed carton shot, xz before normalize. The tube mark faces this same azimuth. */
export const BOX_CLOSED_CAM_X = 0.72;
export const BOX_CLOSED_CAM_Y = 0.46;
export const BOX_CLOSED_CAM_Z = 1;

/** Azimuth of the closed shot. Cylinder theta 0 is +Z and grows toward +X. */
export const BOX_CLOSED_MARK_AZIMUTH = Math.atan2(BOX_CLOSED_CAM_X, BOX_CLOSED_CAM_Z);

/**
 * Front preset. Same azimuth as the mark, with the lower pitch the front view already used.
 * The octagon body yaws onto this azimuth so its front facet faces the same way.
 */
export const BOX_FRONT_CAM_X = BOX_CLOSED_CAM_X;
export const BOX_FRONT_CAM_Y = 0.3;
export const BOX_FRONT_CAM_Z = BOX_CLOSED_CAM_Z;
