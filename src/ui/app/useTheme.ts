import { useEffect } from 'react';
import { resolveTheme, type ThemeChoice } from '../../domain/theme';
import { applyThemeState, safeLocalStorage, writeStoredHint } from './theme';

const QUERY = '(prefers-color-scheme: dark)';

/** Applies the theme whenever the settings change, and follows the system while "system" is chosen. */
export function useApplyTheme(settings: { theme: ThemeChoice; nightMode: boolean }): void {
  useEffect(() => {
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
    const apply = () => {
      const state = {
        theme: resolveTheme(settings.theme, media?.matches ?? true),
        night: settings.nightMode,
      };
      applyThemeState(document, state);
      writeStoredHint(safeLocalStorage(), state);
    };
    apply();
    if (settings.theme !== 'system' || !media) return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme, settings.nightMode]);
}
