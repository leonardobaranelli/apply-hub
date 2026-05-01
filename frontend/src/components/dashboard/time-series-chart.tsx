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

interface Point {
  date: string;
  count: number;
}

interface Props {
  data: Point[];
}

export function TimeSeriesChart({ data }: Props) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Applications per day</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => formatDate(d)}
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
              />
              <YAxis
                allowDecimals={false}
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
              />
              <Tooltip
                labelFormatter={(d) => formatDate(d as string)}
                contentStyle={{
                  background: 'hsl(220 12% 8%)',
                  border: '1px solid hsl(220 10% 20%)',
                  borderRadius: 8,
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="hsl(188 86% 48%)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
