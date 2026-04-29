import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { ApplicationStatus } from '@/types/enums';
import { statusLabels } from '@/types/labels';

interface FunnelStep {
  status: ApplicationStatus;
  count: number;
  conversionFromPrev: number | null;
  conversionFromTop: number;
}

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversion funnel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, idx) => {
          const widthPct = Math.max(8, (step.count / max) * 100);
          return (
            <div key={step.status} className="flex items-center gap-3">
              <div className="w-32 text-sm font-medium text-muted-foreground">
                {statusLabels[step.status]}
              </div>
              <div className="flex flex-1 items-center gap-3">
                <div className="relative h-9 flex-1 overflow-hidden rounded-md bg-secondary">
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0 flex items-center justify-end px-3 text-sm font-semibold transition-all',
                      idx < 3
                        ? 'bg-info text-info-foreground'
                        : idx < 5
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-success text-success-foreground',
                    )}
                    style={{ width: `${widthPct}%` }}
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
