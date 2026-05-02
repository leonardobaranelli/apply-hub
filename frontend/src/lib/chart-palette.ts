/**
 * Theme-aware chart palette helpers.
 *
 * Each preset defines `--chart-1` … `--chart-5` (analogous hue ramp around the
 * preset's anchor) plus a contrast-safe `--chart-foreground`. Components should
 * pull colors through these helpers so charts naturally re-skin per theme.
 */

export const CHART_PALETTE_SIZE = 5;

export type ChartPaletteIndex = 1 | 2 | 3 | 4 | 5;

/** CSS color string for a specific chart slot (1..5). */
export function chartColor(index: ChartPaletteIndex): string {
  return `hsl(var(--chart-${index}))`;
}

/** Foreground color contrast-paired with `chartColor(*)` on the active theme. */
export const chartForeground = 'hsl(var(--chart-foreground))';

/**
 * Map a categorical index (0..N-1) to a chart slot, cycling through the palette.
 * Use for distributions where the order has no semantic meaning beyond grouping.
 */
export function categoricalChartColor(index: number): string {
  const slot = ((index % CHART_PALETTE_SIZE) + 1) as ChartPaletteIndex;
  return chartColor(slot);
}

/**
 * Map an ordinal index (0..total-1) into the 5-stop palette so progress is
 * visible. Used by funnel charts so each step sits on a distinct hue while
 * still belonging to the active theme family.
 */
export function ordinalChartColor(index: number, total: number): string {
  if (total <= 1) return chartColor(3);
  const ratio = index / (total - 1);
  const slot = Math.min(
    CHART_PALETTE_SIZE,
    Math.max(1, Math.round(ratio * (CHART_PALETTE_SIZE - 1)) + 1),
  ) as ChartPaletteIndex;
  return chartColor(slot);
}
