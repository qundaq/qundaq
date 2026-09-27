export const SWIPE_CLOSE_PX = 96;
const FLICK_PX_PER_MS = 0.5;
const FLICK_MIN_PX = 24;

/** Whether a downward drag on a sheet's header closes it: far enough, or a quick flick. */
export function swipeCloses(distancePx: number, elapsedMs: number): boolean {
  if (distancePx > SWIPE_CLOSE_PX) return true;
  return distancePx >= FLICK_MIN_PX && distancePx / Math.max(1, elapsedMs) > FLICK_PX_PER_MS;
}
