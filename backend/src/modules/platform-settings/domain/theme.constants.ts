export const ALLOWED_THEME_IDS = [
  'ocean',
  'violet',
  'emerald',
  'rose',
  'amber',
  'slate',
] as const;

export type AllowedThemeId = (typeof ALLOWED_THEME_IDS)[number];

export const ALLOWED_APPEARANCE_MODES = ['dark', 'dim', 'light'] as const;

export type AllowedAppearanceMode = (typeof ALLOWED_APPEARANCE_MODES)[number];
