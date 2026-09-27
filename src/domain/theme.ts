export type ThemeChoice = 'dark' | 'light' | 'system';
export const THEME_CHOICES: readonly ThemeChoice[] = ['dark', 'light', 'system'];
export type ResolvedTheme = 'dark' | 'light';

export interface ThemeState {
  theme: ResolvedTheme;
  night: boolean;
}

/** A stored choice, or the default (dark) when it is missing or unknown. */
export function readThemeChoice(value: unknown): ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice) ? (value as ThemeChoice) : 'dark';
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === 'system') return prefersDark ? 'dark' : 'light';
  return choice;
}

/** Two words at most, for the first-paint hint in localStorage: "light", "dark+night". Holds no user data. */
export function encodeThemeHint(state: ThemeState): string {
  return state.night ? `${state.theme}+night` : state.theme;
}

export function decodeThemeHint(text: string | null): ThemeState | null {
  if (text === null) return null;
  const [theme, flag, ...rest] = text.split('+');
  if (rest.length > 0 || (theme !== 'dark' && theme !== 'light')) return null;
  if (flag !== undefined && flag !== 'night') return null;
  return { theme, night: flag === 'night' };
}
