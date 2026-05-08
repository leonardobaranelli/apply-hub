import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlatformSettings } from '@/context/platform-settings-context';
import { chartForeground, ordinalChartColor } from '@/lib/chart-palette';

interface FunnelStep {
  status: string;
  count: number;
  conversionFromPrev: number | null;
  conversionFromTop: number;
}

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const { effectiveStatusLabels } = usePlatformSettings();
  const max = Math.max(...steps.map((s) => s.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversion funnel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, idx) => {
          const widthPct = Math.max(8, (step.count / max) * 100);
          const background = ordinalChartColor(idx, steps.length);
          return (
            <div key={step.status} className="flex items-center gap-3">
              <div className="w-32 text-sm font-medium text-muted-foreground">
                {effectiveStatusLabels[step.status] ?? step.status}
              </div>
              <div className="flex flex-1 items-center gap-3">
                <div className="relative h-9 flex-1 overflow-hidden rounded-md bg-secondary">
                  <div
                    className="absolute inset-y-0 left-0 flex items-center justify-end px-3 text-sm font-semibold transition-all"
                    style={{
                      width: `${widthPct}%`,
                      background,
                      color: chartForeground,
                    }}
                  >
                    {step.count}
                  </div>
                </div>
                <div className="w-32 text-right text-xs text-muted-foreground">
                  {step.conversionFromPrev !== null
                    ? `${step.conversionFromPrev.toFixed(1)}% vs prev`
                    : 'top funnel'}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
