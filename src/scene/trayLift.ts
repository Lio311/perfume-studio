/** Written each frame by the box pose. The insert and the bottle read it. */
export const trayLiftNow = { mm: 0 };

/**
 * Extra lift so about 60% of the bottle stands above the carton rim.
 * `start` is the openAmount where the rise begins, so a drawer can slide first.
 */
export function revealRiseMm(rimY: number, bottleH: number, openAmount: number, start = 0.45, seatY = 0): number {
  const needed = Math.max(0, rimY - seatY - bottleH * 0.4);
  const span = Math.max(0.05, 1 - start);
  const t = Math.min(1, Math.max(0, (openAmount - start) / span));
  const eased = 1 - (1 - t) ** 3;
  return needed * eased;
}

/** Local slide of the part that holds the insert. The drawer tray writes this; other closures stay at rest. */
export const insertSeatNow = { x: 0, y: 0, z: 0, active: false };
