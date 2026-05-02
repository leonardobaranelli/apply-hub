export const THEME_PRESET_IDS = [
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

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

/** Darkest → brightest shell ramp between pure dark and pure light UI. */
export const APPEARANCE_MODES = [
  'dark',
  'night',
  'dim',
  'mist',
  'soft',
  'light',
] as const;

export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export function isAppearanceMode(value: string): value is AppearanceMode {
  return (APPEARANCE_MODES as readonly string[]).includes(value);
}

export const THEME_PRESETS: ReadonlyArray<{
  id: ThemePresetId;
  label: string;
  hint: string;
}> = [
  { id: 'ocean', label: 'Ocean', hint: 'Cyan — default accent' },
  { id: 'sky', label: 'Sky', hint: 'Clear blue' },
  { id: 'indigo', label: 'Indigo', hint: 'Deep blue-violet' },
  { id: 'violet', label: 'Violet', hint: 'Royal purple' },
  { id: 'fuchsia', label: 'Fuchsia', hint: 'Electric magenta' },
  { id: 'rose', label: 'Rose', hint: 'Soft pink' },
  { id: 'coral', label: 'Coral', hint: 'Warm orange-pink' },
  { id: 'terracotta', label: 'Terracotta', hint: 'Earthy clay' },
  { id: 'amber', label: 'Amber', hint: 'Amber gold' },
  { id: 'lime', label: 'Lime', hint: 'Chartreuse' },
  { id: 'emerald', label: 'Emerald', hint: 'Fresh green' },
  { id: 'slate', label: 'Slate', hint: 'Cool neutral gray' },
];

export const APPEARANCE_LABELS: Record<AppearanceMode, string> = {
  dark: 'Dark',
  night: 'Night',
  dim: 'Dim',
  mist: 'Mist',
  soft: 'Soft',
  light: 'Light',
};

/** Swatch strip under each preset card (Settings). */
export const THEME_PRESET_SWATCH_CLASS: Record<ThemePresetId, string> = {
  ocean: 'bg-[hsl(188,86%,48%)]',
  sky: 'bg-[hsl(199,89%,55%)]',
  indigo: 'bg-[hsl(239,62%,56%)]',
  violet: 'bg-[hsl(263,72%,58%)]',
  fuchsia: 'bg-[hsl(292,84%,58%)]',
  rose: 'bg-[hsl(350,72%,56%)]',
  coral: 'bg-[hsl(14,88%,58%)]',
  terracotta: 'bg-[hsl(18,52%,52%)]',
  amber: 'bg-[hsl(38,92%,50%)]',
  lime: 'bg-[hsl(88,72%,48%)]',
  emerald: 'bg-[hsl(158,64%,42%)]',
  slate: 'bg-[hsl(215,22%,58%)]',
};
