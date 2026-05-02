import type { AppearanceMode } from './theme-presets';
import {
  APPEARANCE_MODES,
  isAppearanceMode,
  THEME_PRESET_IDS,
  type ThemePresetId,
} from './theme-presets';

const PREFIX = 'theme-preset-';

/**
 * Reads the theme currently applied to `<html>` (and falls back to localStorage).
 * Use this to keep Settings UI selections in sync with what the user actually sees.
 */
export function getAppliedThemeSnapshot(): {
  theme: ThemePresetId;
  appearance: AppearanceMode;
} {
  const el = document.documentElement;

  let appearance: AppearanceMode | undefined;
  for (const m of APPEARANCE_MODES) {
    if (el.classList.contains(m)) {
      appearance = m;
      break;
    }
  }

  let theme: ThemePresetId | undefined;
  for (const id of THEME_PRESET_IDS) {
    if (el.classList.contains(`${PREFIX}${id}`)) {
      theme = id;
      break;
    }
  }

  if (theme && appearance) {
    return { theme, appearance };
  }

  try {
    const t = localStorage.getItem('applyhub-theme');
    const a = localStorage.getItem('applyhub-appearance');
    if (
      t &&
      a &&
      THEME_PRESET_IDS.includes(t as ThemePresetId) &&
      isAppearanceMode(a)
    ) {
      return { theme: t as ThemePresetId, appearance: a };
    }
  } catch {
    /* ignore */
  }

  return { theme: 'ocean', appearance: 'dark' };
}

export function applyDocumentTheme(
  themeId: ThemePresetId,
  appearance: AppearanceMode,
): void {
  if (!THEME_PRESET_IDS.includes(themeId)) return;
  if (!isAppearanceMode(appearance)) return;
  const el = document.documentElement;
  for (const c of [...el.classList]) {
    if (c.startsWith(PREFIX)) el.classList.remove(c);
  }
  for (const m of APPEARANCE_MODES) {
    el.classList.remove(m);
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
