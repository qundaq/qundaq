/** Joins class names, skipping the falsy ones: cx(styles.chip, selected && styles.selected). */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
