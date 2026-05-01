export const THEME_PRESET_IDS = [
  'ocean',
  'violet',
  'emerald',
  'rose',
  'amber',
  'slate',
] as const;

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

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
