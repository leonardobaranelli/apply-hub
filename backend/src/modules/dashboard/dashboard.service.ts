import { Injectable } from '@nestjs/common';
import { JobApplication, Prisma, SearchPlatform } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACTIVE_STATUSES,
  ApplicationMethod,
  ApplicationStatus,
  FUNNEL_ORDER,
  PositionType,
  WorkMode,
  funnelIndex,
} from '../applications/domain/application.enums';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import {
  ActivityHeatmapCell,
  DashboardOverview,
  DistributionItem,
  FunnelStep,
  KpiSummary,
  MethodEffectiveness,
  SearchActivityOverview,
  SearchCompletionKey,
  TimeSeriesPoint,
  TopCompany,
} from './dashboard.types';

const INTERVIEW_OR_BEYOND = new Set<ApplicationStatus>([
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.OFFER,
  ApplicationStatus.NEGOTIATING,
  ApplicationStatus.ACCEPTED,
]);

const OFFER_OR_BEYOND = new Set<ApplicationStatus>([
  ApplicationStatus.OFFER,
  ApplicationStatus.NEGOTIATING,
  ApplicationStatus.ACCEPTED,
]);

interface HeatmapRow {
  weekday: number;
  hour: number;
  count: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: DashboardQueryDto): Promise<DashboardOverview> {
    const apps = await this.fetchApplications(query);

    const kpis = this.computeKpis(apps);
    const byStatus = this.distribution(apps, (a) => a.status as ApplicationStatus);
    const byPosition = this.distribution(apps, (a) => a.position as PositionType);
    const byMethod = this.distribution(
      apps,
      (a) => a.applicationMethod as ApplicationMethod,
    );
    const byWorkMode = this.distribution(apps, (a) => a.workMode as WorkMode);
    const funnel = this.computeFunnel(apps);
    const applicationsPerDay = this.computeTimeSeries(apps);
    const activityHeatmap = await this.computeHeatmap(query);
    const methodEffectiveness = this.computeMethodEffectiveness(apps);
    const topCompanies = this.computeTopCompanies(apps);
    const upcomingFollowUps = this.computeUpcomingFollowUps(apps);

    return {
      kpis,
      byStatus: byStatus as DistributionItem<ApplicationStatus>[],
      byPosition: byPosition as DistributionItem<PositionType>[],
      byMethod: byMethod as DistributionItem<ApplicationMethod>[],
      byWorkMode: byWorkMode as DistributionItem<WorkMode>[],
      funnel,
      applicationsPerDay,
      activityHeatmap,
      methodEffectiveness,
      topCompanies,
      upcomingFollowUps,
    };
  }

  async getSearchActivity(query: DashboardQueryDto): Promise<SearchActivityOverview> {
    const where: Prisma.JobSearchSessionWhereInput = {};
    if (query.fromDate || query.toDate) {
      where.searchedAt = {
        ...(query.fromDate
          ? { gte: new Date(`${query.fromDate}T00:00:00.000Z`) }
          : {}),
        ...(query.toDate
          ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) }
          : {}),
      };
    }

    const sessions = await this.prisma.jobSearchSession.findMany({
      where,
      orderBy: { searchedAt: 'desc' },
      include: { _count: { select: { applications: true } } },
    });

    const totalSessions = sessions.length;
    const linkedApplicationsCount = sessions.reduce(
      (sum, row) => sum + row._count.applications,
      0,
    );
    const byPlatform = this.sessionFieldDistribution(
      sessions,
      (s) => s.platform as SearchPlatform,
    );
    const byCompletion = this.sessionFieldDistribution(
      sessions,
      (s): SearchCompletionKey => (s.isComplete ? 'complete' : 'active'),
    );
    const searchesPerDay = this.computeSearchSessionsTimeSeries(sessions);
    const topQueries = this.computeTopSearchQueries(sessions);
    const recentSessions = sessions.slice(0, 20).map((s) => ({
      id: s.id,
      platform: s.platform,
      platformOther: s.platformOther,
      queryTitle: s.queryTitle,
      searchedAt: s.searchedAt.toISOString(),
      isComplete: s.isComplete,
      applicationsCount: s._count.applications,
      filterDescription: s.filterDescription,
      jobPostedFrom: s.jobPostedFrom.toISOString(),
      resultsApproxCount: s.resultsApproxCount,
    }));

    return {
      totalSessions,
      linkedApplicationsCount,
      byPlatform,
      byCompletion,
      searchesPerDay,
      topQueries,
      recentSessions,
    };
  }

  // ───────────────────────────────────────────────────────────────────
  //  Helpers
  // ───────────────────────────────────────────────────────────────────
  private async fetchApplications(
    query: DashboardQueryDto,
  ): Promise<JobApplication[]> {
    const where: Prisma.JobApplicationWhereInput = { archivedAt: null };
    if (query.fromDate || query.toDate) {
      where.applicationDate = {
        ...(query.fromDate
          ? { gte: new Date(`${query.fromDate}T00:00:00.000Z`) }
          : {}),
        ...(query.toDate
          ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) }
          : {}),
      };
    }
    return this.prisma.jobApplication.findMany({ where });
  }

  private computeKpis(apps: JobApplication[]): KpiSummary {
    const total = apps.length;
    const active = apps.filter((a) =>
      ACTIVE_STATUSES.has(a.status as ApplicationStatus),
    ).length;
    const responded = apps.filter((a) =>
      this.hasReachedFunnelStep(a, ApplicationStatus.SCREENING),
    ).length;
    const interviewing = apps.filter((a) =>
      INTERVIEW_OR_BEYOND.has(a.status as ApplicationStatus),
    ).length;
    const offers = apps.filter((a) =>
      OFFER_OR_BEYOND.has(a.status as ApplicationStatus),
    ).length;
    const accepted = apps.filter(
      (a) => a.status === ApplicationStatus.ACCEPTED,
    ).length;
    const rejected = apps.filter(
      (a) => a.status === ApplicationStatus.REJECTED,
    ).length;
    const ghosted = apps.filter(
      (a) => a.status === ApplicationStatus.GHOSTED,
    ).length;

    const ratio = (n: number, d: number): number =>
      d === 0 ? 0 : Math.round((n / d) * 1000) / 10;

    const respDays: number[] = [];
    const offerDays: number[] = [];
    for (const app of apps) {
      const submittedAt = app.applicationDate;
      if (app.firstResponseAt) {
        const diff =
          (app.firstResponseAt.getTime() - submittedAt.getTime()) /
          (1000 * 60 * 60 * 24);
        if (diff >= 0) respDays.push(diff);
      }
      if (
        OFFER_OR_BEYOND.has(app.status as ApplicationStatus) &&
        app.lastActivityAt
      ) {
        const diff =
          (app.lastActivityAt.getTime() - submittedAt.getTime()) /
          (1000 * 60 * 60 * 24);
        if (diff >= 0) offerDays.push(diff);
      }
    }
    const avg = (arr: number[]): number | null =>
      arr.length === 0
        ? null
        : Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;

    return {
      total,
      active,
      responded,
      interviewing,
      offers,
      accepted,
      rejected,
      ghosted,
      responseRate: ratio(responded, total),
      interviewRate: ratio(interviewing, total),
      offerRate: ratio(offers, total),
      acceptanceRate: ratio(accepted, total),
      avgDaysToFirstResponse: avg(respDays),
      avgDaysToOffer: avg(offerDays),
    };
  }

  private hasReachedFunnelStep(
    app: JobApplication,
    target: ApplicationStatus,
  ): boolean {
    if (app.firstResponseAt) return true;
    return funnelIndex(app.status as ApplicationStatus) >= funnelIndex(target);
  }

  private distribution<K extends string>(
    apps: JobApplication[],
    keyOf: (a: JobApplication) => K,
  ): DistributionItem<K>[] {
    const counts = new Map<K, number>();
    for (const app of apps) {
      const k = keyOf(app);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const total = apps.length;
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        key,
        count,
        percentage: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private computeFunnel(apps: JobApplication[]): FunnelStep[] {
    const steps: FunnelStep[] = [];
    const total = apps.length;
    let prev: number | null = null;
    for (const status of FUNNEL_ORDER) {
      const reached = apps.filter((a) =>
        this.hasReachedFunnelStep(a, status),
      ).length;
      steps.push({
        status,
        count: reached,
        conversionFromPrev:
          prev === null
            ? null
            : prev === 0
              ? 0
              : Math.round((reached / prev) * 1000) / 10,
        conversionFromTop:
          total === 0 ? 0 : Math.round((reached / total) * 1000) / 10,
      });
      prev = reached;
    }
    return steps;
  }

  private computeTimeSeries(apps: JobApplication[]): TimeSeriesPoint[] {
    const counts = new Map<string, number>();
    for (const app of apps) {
      const date = app.applicationDate.toISOString().slice(0, 10);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, count]) => ({ date, count }));
  }

  private async computeHeatmap(
    query: DashboardQueryDto,
  ): Promise<ActivityHeatmapCell[]> {
    const from = query.fromDate
      ? new Date(`${query.fromDate}T00:00:00.000Z`)
      : new Date('1970-01-01T00:00:00.000Z');
    const to = query.toDate
      ? new Date(`${query.toDate}T23:59:59.999Z`)
      : new Date('9999-12-31T23:59:59.999Z');

    const rows = await this.prisma.$queryRaw<HeatmapRow[]>`
      SELECT
        EXTRACT(DOW FROM occurred_at)::int  AS weekday,
        EXTRACT(HOUR FROM occurred_at)::int AS hour,
        COUNT(*)::int                       AS count
      FROM application_events
      WHERE occurred_at >= ${from}
        AND occurred_at <= ${to}
      GROUP BY weekday, hour
      ORDER BY weekday, hour
    `;

    return rows.map((r) => ({
      weekday: Number(r.weekday),
      hour: Number(r.hour),
      count: Number(r.count),
    }));
  }

  private computeMethodEffectiveness(
    apps: JobApplication[],
  ): MethodEffectiveness[] {
    const grouped = new Map<ApplicationMethod, JobApplication[]>();
    for (const app of apps) {
      const method = app.applicationMethod as ApplicationMethod;
      const list = grouped.get(method) ?? [];
      list.push(app);
      grouped.set(method, list);
    }
    const result: MethodEffectiveness[] = [];
    for (const [method, list] of grouped.entries()) {
      const total = list.length;
      const responded = list.filter((a) =>
        this.hasReachedFunnelStep(a, ApplicationStatus.SCREENING),
      ).length;
      const interviewing = list.filter((a) =>
        INTERVIEW_OR_BEYOND.has(a.status as ApplicationStatus),
      ).length;
      const offers = list.filter((a) =>
        OFFER_OR_BEYOND.has(a.status as ApplicationStatus),
      ).length;
      const ratio = (n: number): number =>
        total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
      result.push({
        method,
        total,
        responseRate: ratio(responded),
        interviewRate: ratio(interviewing),
        offerRate: ratio(offers),
      });
    }
    return result.sort((a, b) => b.total - a.total);
  }

  private computeTopCompanies(apps: JobApplication[]): TopCompany[] {
    const grouped = new Map<string, JobApplication[]>();
    for (const app of apps) {
      const key = app.companyName.trim().toLowerCase();
      const list = grouped.get(key) ?? [];
      list.push(app);
      grouped.set(key, list);
    }
    const result: TopCompany[] = [];
    for (const [, list] of grouped.entries()) {
      result.push({
        companyName: list[0]?.companyName ?? 'Unknown',
        applicationsCount: list.length,
        activeCount: list.filter((a) =>
          ACTIVE_STATUSES.has(a.status as ApplicationStatus),
        ).length,
      });
    }
    return result
      .sort((a, b) => b.applicationsCount - a.applicationsCount)
      .slice(0, 10);
  }

  private computeUpcomingFollowUps(apps: JobApplication[]): number {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return apps.filter((a) => {
      if (!ACTIVE_STATUSES.has(a.status as ApplicationStatus)) return false;
      const ref = a.lastActivityAt?.getTime() ?? a.applicationDate.getTime();
      return now - ref >= sevenDays;
    }).length;
  }

  private sessionFieldDistribution<K extends string, S>(
    sessions: S[],
    keyOf: (s: S) => K,
  ): DistributionItem<K>[] {
    const counts = new Map<K, number>();
    for (const s of sessions) {
      const k = keyOf(s);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const total = sessions.length;
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        key,
        count,
        percentage: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private computeSearchSessionsTimeSeries(
    sessions: Array<{ searchedAt: Date }>,
  ): TimeSeriesPoint[] {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      const date = s.searchedAt.toISOString().slice(0, 10);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, count]) => ({ date, count }));
  }

  private computeTopSearchQueries(
    sessions: Array<{ queryTitle: string }>,
  ): Array<{ queryTitle: string; count: number }> {
    const map = new Map<string, { display: string; count: number }>();
    for (const s of sessions) {
      const display = s.queryTitle.trim();
      const key = display.toLowerCase();
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { display, count: 1 });
    }
    return Array.from(map.values())
      .map((v) => ({ queryTitle: v.display, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }
}
