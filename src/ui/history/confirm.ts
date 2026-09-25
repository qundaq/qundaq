/**
 * "Sil" needs two taps. The second counts only between these bounds after the first: a sleepy double tap
 * is faster (and restarts the wait), and after four seconds the button has gone back to "Sil".
 */
export const DELETE_CONFIRM_MIN_MS = 600;
export const DELETE_CONFIRM_MAX_MS = 4000;

export interface DeleteTap {
  armedAt: number | null; // when the button turned into "Tap again to delete"; null: not armed
  confirmed: boolean;
}

export function deleteTap(armedAt: number | null, now: number): DeleteTap {
  if (armedAt === null || now < armedAt || now - armedAt > DELETE_CONFIRM_MAX_MS) return { armedAt: now, confirmed: false };
  // Too fast: re-arm from this tap, so a sleepy triple tap (0 / 300 / 650 ms) cannot delete either.
  if (now - armedAt < DELETE_CONFIRM_MIN_MS) return { armedAt: now, confirmed: false };
  return { armedAt: null, confirmed: true };
}
