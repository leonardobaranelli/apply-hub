import type { ThemePresetId } from './theme-presets';
import { THEME_PRESET_IDS } from './theme-presets';

const PREFIX = 'theme-preset-';

export function applyDocumentTheme(themeId: ThemePresetId): void {
  if (!THEME_PRESET_IDS.includes(themeId)) return;
  const el = document.documentElement;
  for (const c of [...el.classList]) {
    if (c.startsWith(PREFIX)) el.classList.remove(c);
  }
  el.classList.add(`${PREFIX}${themeId}`);
  try {
    localStorage.setItem('applyhub-theme', themeId);
  } catch {
    /* ignore */
  }
}
