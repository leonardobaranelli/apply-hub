import { useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Inbox,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLoader } from '@/components/ui/spinner';
import { ActivityHeatmap } from '@/components/dashboard/activity-heatmap';
import { DistributionBars } from '@/components/dashboard/distribution-bars';
import { FunnelChart } from '@/components/dashboard/funnel-chart';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { TimeSeriesChart } from '@/components/dashboard/time-series-chart';
import { PageHeader } from '@/components/layout/page-header';
import { useDashboard } from '@/hooks/use-dashboard';
import { useMarkStaleAsGhosted } from '@/hooks/use-applications';
import { formatNumber } from '@/lib/format';
import {
  methodLabels,
  positionLabels,
  statusLabels,
  workModeLabels,
} from '@/types/labels';

export function DashboardPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data, isLoading, isError } = useDashboard({
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const ghostMutation = useMarkStaleAsGhosted();

  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <p className="text-sm text-destructive">
        Could not load the dashboard. Is the backend running?
      </p>
    );
  }

  const { kpis, byStatus, byPosition, byMethod, byWorkMode } = data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Global view of your process. Optimize decisions with real data."
        actions={
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="fromDate">From</Label>
              <Input
                id="fromDate"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label htmlFor="toDate">To</Label>
              <Input
                id="toDate"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
            >
              Clear
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Total"
          value={formatNumber(kpis.total)}
          icon={Briefcase}
          accent="primary"
        />
        <KpiCard
          label="Active"
          value={formatNumber(kpis.active)}
          icon={Sparkles}
          accent="info"
          hint={`${data.upcomingFollowUps ?? 0} need follow-up`}
        />
        <KpiCard
          label="Interviewing"
          value={formatNumber(kpis.interviewing)}
          icon={Target}
          accent="warning"
        />
        <KpiCard
          label="Offers"
          value={formatNumber(kpis.offers)}
          icon={Trophy}
          accent="success"
          hint={`${formatNumber(kpis.accepted)} accepted`}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Response rate"
          value={`${kpis.responseRate.toFixed(1)}%`}
          icon={TrendingUp}
          accent="info"
          hint={`${formatNumber(kpis.responded)} responded`}
        />
        <KpiCard
          label="Interview rate"
          value={`${kpis.interviewRate.toFixed(1)}%`}
          icon={TrendingUp}
          accent="primary"
        />
        <KpiCard
          label="Offer rate"
          value={`${kpis.offerRate.toFixed(1)}%`}
          icon={CheckCircle2}
          accent="success"
        />
        <KpiCard
          label="Days to 1st response"
          value={
            kpis.avgDaysToFirstResponse !== null
              ? kpis.avgDaysToFirstResponse.toFixed(1)
              : '—'
          }
          icon={Clock}
          accent="warning"
          hint={
            kpis.avgDaysToOffer !== null
              ? `${kpis.avgDaysToOffer.toFixed(1)} days to offer`
              : 'no offers yet'
          }
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TimeSeriesChart data={data.applicationsPerDay} />
        </div>
        <FunnelChart steps={data.funnel} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <DistributionBars
          title="By status"
          items={byStatus.map((s) => ({
            key: s.key,
            label: statusLabels[s.key],
            count: s.count,
            percentage: s.percentage,
          }))}
        />
        <DistributionBars
          title="By application method"
          items={byMethod.map((m) => ({
            key: m.key,
            label: methodLabels[m.key],
            count: m.count,
            percentage: m.percentage,
          }))}
        />
        <DistributionBars
          title="By position type"
          items={byPosition.map((p) => ({
            key: p.key,
            label: positionLabels[p.key],
            count: p.count,
            percentage: p.percentage,
          }))}
        />
        <DistributionBars
          title="By work mode"
          items={byWorkMode.map((w) => ({
            key: w.key,
            label: workModeLabels[w.key],
            count: w.count,
            percentage: w.percentage,
          }))}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ActivityHeatmap cells={data.activityHeatmap} />

        <Card>
          <CardHeader>
            <CardTitle>Method effectiveness</CardTitle>
          </CardHeader>
          <CardContent>
            {data.methodEffectiveness.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-3">Method</th>
                      <th className="py-2 pr-3 text-right">Total</th>
                      <th className="py-2 pr-3 text-right">Resp.</th>
                      <th className="py-2 pr-3 text-right">Interv.</th>
                      <th className="py-2 text-right">Offer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.methodEffectiveness.map((m) => (
                      <tr key={m.method} className="border-b border-border/50">
                        <td className="py-2 pr-3">{methodLabels[m.method]}</td>
                        <td className="py-2 pr-3 text-right font-medium">
                          {m.total}
                        </td>
                        <td className="py-2 pr-3 text-right text-info">
                          {m.responseRate.toFixed(1)}%
                        </td>
                        <td className="py-2 pr-3 text-right text-primary">
                          {m.interviewRate.toFixed(1)}%
                        </td>
                        <td className="py-2 text-right text-success">
                          {m.offerRate.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top companies</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topCompanies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data</p>
            ) : (
              <ul className="space-y-2">
                {data.topCompanies.map((c) => (
                  <li
                    key={c.companyName}
                    className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{c.companyName}</span>
                    <span className="text-muted-foreground">
                      {c.applicationsCount} applications · {c.activeCount} active
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox size={18} /> Quick actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Keep your pipeline clean: mark as ghosted any applications stale
              for more than 21 days.
            </p>
            <Button
              variant="outline"
              size="sm"
              loading={ghostMutation.isPending}
              onClick={() => ghostMutation.mutate(undefined)}
            >
              Mark stale as ghosted
            </Button>
            {ghostMutation.data ? (
              <p className="text-xs text-muted-foreground">
                Last run: {ghostMutation.data.ghostedCount} marked.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
