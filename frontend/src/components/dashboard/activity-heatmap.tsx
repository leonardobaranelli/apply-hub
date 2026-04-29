import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Cell {
  weekday: number;
  hour: number;
  count: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HOURS_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(24, minmax(0, 1fr))',
  gap: 4,
};

export function ActivityHeatmap({ cells }: { cells: Cell[] }) {
  const matrix: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  for (const cell of cells) {
    if (matrix[cell.weekday]) {
      matrix[cell.weekday][cell.hour] = cell.count;
    }
  }
  const max = Math.max(...cells.map((c) => c.count), 1);

  const intensity = (count: number): string => {
    if (count === 0) return 'bg-secondary';
    const ratio = count / max;
    if (ratio < 0.25) return 'bg-primary/20';
    if (ratio < 0.5) return 'bg-primary/40';
    if (ratio < 0.75) return 'bg-primary/65';
    return 'bg-primary';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity by hour and day</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[640px]">
            <div className="flex items-center gap-2">
              <div className="w-10" />
              <div className="flex-1" style={HOURS_GRID}>
                {Array.from({ length: 24 }, (_, h) => (
                  <span
                    key={h}
                    className="text-center text-[10px] text-muted-foreground"
                  >
                    {h % 3 === 0 ? h : ''}
                  </span>
                ))}
              </div>
            </div>
            {WEEKDAYS.map((dayLabel, dayIdx) => (
              <div key={dayIdx} className="mt-1 flex items-center gap-2">
                <span className="w-10 text-xs text-muted-foreground">
                  {dayLabel}
                </span>
                <div className="flex-1" style={HOURS_GRID}>
                  {Array.from({ length: 24 }, (_, h) => {
                    const count = matrix[dayIdx]?.[h] ?? 0;
                    return (
                      <div
                        key={h}
                        className={`h-4 rounded-sm ${intensity(count)}`}
                        title={`${dayLabel} ${h}:00 → ${count} events`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
