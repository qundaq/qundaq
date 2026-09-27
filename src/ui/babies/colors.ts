export const BABY_COLORS = [
  { id: 'blue', hex: '#7cb7ff' },
  { id: 'pink', hex: '#ff9ecb' },
  { id: 'green', hex: '#8fdc9a' },
  { id: 'yellow', hex: '#ffd166' },
  { id: 'purple', hex: '#c3a6ff' },
  { id: 'orange', hex: '#ffab76' },
] as const;

/** First palette color no baby uses yet; cycles when all are taken. */
export function nextColor(usedHexes: readonly string[]): string {
  const free = BABY_COLORS.find((color) => !usedHexes.includes(color.hex));
  return (free ?? BABY_COLORS[usedHexes.length % BABY_COLORS.length]!).hex;
}

/** The stripe and dot colour for a baby: a theme token for palette colours, so light and night mode re-tint them. */
export function resolveBabyColor(hex: string): string {
  const known = BABY_COLORS.find((color) => color.hex.toLowerCase() === hex.toLowerCase());
  return known ? `var(--baby-${known.id})` : hex;
}
