/**
 * Canned box framing is for a demo link and the first time the stage becomes the box.
 * Later open and close keep the orbit the user already has.
 */
export function boxCameraSnap(input: { boxScene: boolean; demo: boolean; entered: boolean; pullBack: number }): boolean {
  return input.boxScene && input.pullBack <= 1 && (input.demo || !input.entered);
}
