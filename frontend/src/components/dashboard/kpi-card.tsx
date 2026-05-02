import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { ChartPaletteIndex } from '@/lib/chart-palette';

/**
 * Semantic accents (`destructive`) keep their universal meaning — a destructive
 * KPI must stay red regardless of theme. Theme accents (`chart1..chart5`)
 * follow the active preset's analogous palette so dashboards re-skin per theme.
 */
type SemanticAccent = 'destructive';
type ThemeAccent = `chart${ChartPaletteIndex}`;
export type KpiAccent = SemanticAccent | ThemeAccent;

interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  accent?: KpiAccent;
  className?: string;
}

const semanticAccentClasses: Record<SemanticAccent, string> = {
  destructive: 'text-destructive bg-destructive/10',
};

function themeAccentStyle(slot: ChartPaletteIndex): CSSProperties {
  return {
    color: `hsl(var(--chart-${slot}))`,
    backgroundColor: `hsl(var(--chart-${slot}) / 0.12)`,
  };
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = 'chart3',
  className,
}: KpiCardProps) {
  const isThemeAccent = accent.startsWith('chart');
  const slot = isThemeAccent
    ? (Number(accent.slice(5)) as ChartPaletteIndex)
    : null;
  const semanticClass =
    !isThemeAccent && accent in semanticAccentClasses
      ? semanticAccentClasses[accent as SemanticAccent]
      : '';

  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
          {hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {Icon ? (
          <div
            className={cn('rounded-lg p-2', semanticClass)}
            style={slot !== null ? themeAccentStyle(slot) : undefined}
          >
            <Icon size={18} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
