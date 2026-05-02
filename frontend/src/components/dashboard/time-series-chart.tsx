import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { chartColor } from '@/lib/chart-palette';

interface Point {
  date: string;
  count: number;
}

interface Props {
  data: Point[];
  title?: string;
}

export function TimeSeriesChart({ data, title = 'Applications per day' }: Props) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.6}
              />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => formatDate(d)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
              />
              <YAxis
                allowDecimals={false}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
              />
              <Tooltip
                labelFormatter={(d) => formatDate(d as string)}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  color: 'hsl(var(--card-foreground))',
                }}
                cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={chartColor(3)}
                strokeWidth={2}
                dot={{ r: 3, fill: chartColor(3), stroke: chartColor(3) }}
                activeDot={{ r: 5, fill: chartColor(3), stroke: chartColor(3) }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
