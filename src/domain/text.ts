/** Case-insensitive key that treats İ/I/ı/i alike, so "İbuprofen" and "ibuprofen", or "Işık" and "ışık", match. */
export function foldCase(text: string): string {
  return text.normalize('NFKD').replace(/\u0307/g, '').toLowerCase().replace(/ı/g, 'i');
}
