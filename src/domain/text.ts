/**
 * Case-insensitive key that folds the Turkish dotted capital I (\u0130) and dotless lowercase i
 * (\u0131) together with plain "I"/"i", on top of ordinary case folding, so a name typed with
 * Turkish casing matches the same name typed without it.
 */
export function foldCase(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\u0307/g, '')
    .toLowerCase()
    .replace(/\u0131/g, 'i');
}
