/** Written each frame by the box pose. The insert and the bottle read it. */
export const trayLiftNow = { mm: 0 };

/** Local slide of the part that holds the insert. The drawer tray writes this; other closures stay at rest. */
export const insertSeatNow = { x: 0, y: 0, z: 0, active: false };
