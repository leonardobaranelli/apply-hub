import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Inbox,
  Search,
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
import { useDashboard, useSearchActivity } from '@/hooks/use-dashboard';
import { useMarkStaleAsGhosted } from '@/hooks/use-applications';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import type { SearchSessionSummary } from '@/types/models';
import {
  methodLabels,
  positionLabels,
  searchCompletionLabels,
  searchPlatformLabels,
  statusLabels,
  workModeLabels,
} from '@/types/labels';

type DashboardTab = 'pipeline' | 'search';

const TABS: ReadonlyArray<{ id: DashboardTab; label: string }> = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'search', label: 'Search activity' },
];

function sessionPlatformLabel(s: Pick<SearchSessionSummary, 'platform' | 'platformOther'>): string {
  if (s.platform === 'other' && s.platformOther?.trim()) {
    return `${searchPlatformLabels.other} (${s.platformOther.trim()})`;
  }
  return searchPlatformLabels[s.platform];
}

export function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>('pipeline');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const dateParams = {
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  };

  const dateActions = (
    <div className="flex flex-wrap items-end gap-2">
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
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Switch between pipeline analytics and logged job-search sessions."
        actions={dateActions}
      />

      <div
        className="mb-4 inline-flex rounded-lg border border-border bg-card p-1"
        role="tablist"
        aria-label="Dashboard view"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'pipeline' ? (
        <PipelineDashboardPanel {...dateParams} />
      ) : (
        <SearchActivityPanel {...dateParams} />
      )}
    </>
  );
}

function PipelineDashboardPanel({
  fromDate,
  toDate,
}: {
  fromDate?: string;
  toDate?: string;
}) {
  const { data, isLoading, isError } = useDashboard({ fromDate, toDate });
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

function SearchActivityPanel({
  fromDate,
  toDate,
}: {
  fromDate?: string;
  toDate?: string;
}) {
  const { data, isLoading, isError } = useSearchActivity({ fromDate, toDate });

  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <p className="text-sm text-destructive">
        Could not load search analytics. Is the backend running?
      </p>
    );
  }

  const appsPerSession =
    data.totalSessions === 0
      ? 0
      : Math.round((data.linkedApplicationsCount / data.totalSessions) * 10) / 10;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Date range applies to when the search was logged (
          <code className="text-xs">searchedAt</code>).
        </p>
        <Link
          to="/search-sessions"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-transparent px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary',
          )}
        >
          <Search size={14} /> Manage sessions
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Sessions logged"
          value={formatNumber(data.totalSessions)}
          icon={Search}
          accent="primary"
        />
        <KpiCard
          label="Applications linked"
          value={formatNumber(data.linkedApplicationsCount)}
          icon={Briefcase}
          accent="info"
          hint={
            data.totalSessions === 0
              ? 'link from application form'
              : `~${appsPerSession} per session`
          }
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TimeSeriesChart
          data={data.searchesPerDay}
          title="Search sessions per day"
        />
        <div className="grid grid-cols-1 gap-4">
          <DistributionBars
            title="By platform"
            items={data.byPlatform.map((row) => ({
              key: row.key,
              label: sessionPlatformLabel({
                platform: row.key,
                platformOther: null,
              }),
              count: row.count,
              percentage: row.percentage,
            }))}
          />
          <DistributionBars
            title="By completion"
            items={data.byCompletion.map((row) => ({
              key: row.key,
              label: searchCompletionLabels[row.key],
              count: row.count,
              percentage: row.percentage,
            }))}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top queries</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topQueries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions in range</p>
            ) : (
              <ul className="space-y-2">
                {data.topQueries.map((q, i) => (
                  <li
                    key={`${q.queryTitle}-${i}`}
                    className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{q.queryTitle}</span>
                    <span className="text-muted-foreground">{q.count}×</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions in range</p>
            ) : (
              <ul className="space-y-3">
                {data.recentSessions.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-md border border-border/60 px-3 py-2 text-sm"
                  >
                    <p className="font-medium">{s.queryTitle}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {sessionPlatformLabel(s)} · {formatDateTime(s.searchedAt)} ·{' '}
                      {searchCompletionLabels[s.isComplete ? 'complete' : 'incomplete']} ·{' '}
                      {s.applicationsCount} apps
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Job posted from: {formatDate(s.jobPostedFrom)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
