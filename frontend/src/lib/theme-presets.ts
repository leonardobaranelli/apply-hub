export const THEME_PRESET_IDS = [
  'ocean',
  'violet',
  'emerald',
  'rose',
  'amber',
  'slate',
] as const;

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

export const APPEARANCE_MODES = ['dark', 'dim', 'light'] as const;

export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const THEME_PRESETS: ReadonlyArray<{
  id: ThemePresetId;
  label: string;
  hint: string;
}> = [
  { id: 'ocean', label: 'Ocean', hint: 'Original cyan accent' },
  { id: 'violet', label: 'Violet', hint: 'Purple highlights' },
  { id: 'emerald', label: 'Emerald', hint: 'Green highlights' },
  { id: 'rose', label: 'Rose', hint: 'Pink highlights' },
  { id: 'amber', label: 'Amber', hint: 'Warm gold' },
  { id: 'slate', label: 'Slate', hint: 'Cool steel blue-gray' },
];

export const APPEARANCE_LABELS: Record<AppearanceMode, string> = {
  dark: 'Dark',
  dim: 'Dim',
  light: 'Light',
};
