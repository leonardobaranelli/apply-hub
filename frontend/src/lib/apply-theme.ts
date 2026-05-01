import type { AppearanceMode } from './theme-presets';
import { APPEARANCE_MODES, THEME_PRESET_IDS, type ThemePresetId } from './theme-presets';

const PREFIX = 'theme-preset-';

export function applyDocumentTheme(
  themeId: ThemePresetId,
  appearance: AppearanceMode,
): void {
  if (!THEME_PRESET_IDS.includes(themeId)) return;
  if (!APPEARANCE_MODES.includes(appearance)) return;
  const el = document.documentElement;
  for (const c of [...el.classList]) {
    if (c.startsWith(PREFIX)) el.classList.remove(c);
    if (c === 'dark' || c === 'dim' || c === 'light') el.classList.remove(c);
  }
  el.classList.add(appearance);
  el.classList.add(`${PREFIX}${themeId}`);
  try {
    localStorage.setItem('applyhub-theme', themeId);
    localStorage.setItem('applyhub-appearance', appearance);
  } catch {
    /* ignore */
  }
}
