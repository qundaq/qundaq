import { decodeThemeHint, encodeThemeHint, type ThemeState } from '../../domain/theme';

export const THEME_COLORS = { dark: '#0e1420', light: '#f3f5f8', night: '#000000' } as const;
export const THEME_HINT_KEY = 'qundaq.theme';

/** Writes the resolved theme to the document: attributes for tokens.css, the status-bar colour, native controls. */
export function applyThemeState(doc: Document, state: ThemeState): void {
  const root = doc.documentElement;
  root.dataset.theme = state.theme;
  root.dataset.night = String(state.night);
  root.style.colorScheme = state.night ? 'dark' : state.theme;
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta)
    (meta as HTMLMetaElement).content = state.night
      ? THEME_COLORS.night
      : THEME_COLORS[state.theme];
}

export function readStoredHint(storage: Pick<Storage, 'getItem'> | null): ThemeState | null {
  try {
    return storage ? decodeThemeHint(storage.getItem(THEME_HINT_KEY)) : null;
  } catch {
    return null;
  }
}

export function writeStoredHint(storage: Pick<Storage, 'setItem'> | null, state: ThemeState): void {
  try {
    storage?.setItem(THEME_HINT_KEY, encodeThemeHint(state));
  } catch {
    // Private mode or a full quota: the hint is a convenience, the settings row is the truth.
  }
}

/** window.localStorage, or null where touching it throws (some privacy modes). */
export function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
