// Digits, optionally one separator and more digits. Rejects "1e3", "0x10", "+5", "Infinity", "3,4,5".
const DECIMAL = /^\d+([.,]\d+)?$/;

/** Parses "3,45" or "3.45" (either separator, at most one). Anything else, including empty, is null. */
export function parseDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** value × factor rounded half up to a whole number, immune to binary float error (37.95 × 10 → 380). */
export function scaleToInt(value: number, factor: number): number {
  return Math.round(Number((value * factor).toFixed(6)));
}
