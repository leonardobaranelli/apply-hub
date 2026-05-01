export const ALLOWED_THEME_IDS = [
  'ocean',
  'violet',
  'emerald',
  'rose',
  'amber',
  'slate',
] as const;

export type AllowedThemeId = (typeof ALLOWED_THEME_IDS)[number];
