export const ALLOWED_THEME_IDS = [
  'ocean',
  'sky',
  'indigo',
  'violet',
  'fuchsia',
  'rose',
  'coral',
  'terracotta',
  'amber',
  'lime',
  'emerald',
  'slate',
] as const;

export type AllowedThemeId = (typeof ALLOWED_THEME_IDS)[number];

export const ALLOWED_APPEARANCE_MODES = [
  'dark',
  'night',
  'dim',
  'mist',
  'soft',
  'light',
] as const;

export type AllowedAppearanceMode = (typeof ALLOWED_APPEARANCE_MODES)[number];
