import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DistributionItem {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

interface Props {
  title: string;
  items: DistributionItem[];
  emptyMessage?: string;
}

export function DistributionBars({ title, items, emptyMessage }: Props) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {emptyMessage ?? 'No data yet'}
          </p>
        ) : (
          items.map((item) => (
            <div key={item.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground">
                  {item.count}{' '}
                  <span className="text-xs">({item.percentage.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
