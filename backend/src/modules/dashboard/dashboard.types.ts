import {
  ApplicationStatus,
  WorkMode,
} from '../applications/domain/application.enums';

export type SearchCompletionKey = 'complete' | 'active';

export interface KpiSummary {
  total: number;
  active: number;
  responded: number;
  interviewing: number;
  offers: number;
  accepted: number;
  rejected: number;
  ghosted: number;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
  acceptanceRate: number;
  avgDaysToFirstResponse: number | null;
  avgDaysToOffer: number | null;
}

export interface DistributionItem<T extends string = string> {
  key: T;
  count: number;
  percentage: number;
}

export interface FunnelStep {
  status: ApplicationStatus;
  count: number;
  conversionFromPrev: number | null;
  conversionFromTop: number;
}

export interface TimeSeriesPoint {
  date: string;
  count: number;
}

export interface ActivityHeatmapCell {
  weekday: number;
  hour: number;
  count: number;
}

export interface MethodEffectiveness {
  method: string;
  total: number;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
}

export interface TopCompany {
  companyName: string;
  applicationsCount: number;
  activeCount: number;
}

export interface DashboardOverview {
  kpis: KpiSummary;
  byStatus: DistributionItem<ApplicationStatus>[];
  byPosition: DistributionItem<string>[];
  byMethod: DistributionItem<string>[];
  byWorkMode: DistributionItem<WorkMode>[];
  funnel: FunnelStep[];
  applicationsPerDay: TimeSeriesPoint[];
  activityHeatmap: ActivityHeatmapCell[];
  methodEffectiveness: MethodEffectiveness[];
  topCompanies: TopCompany[];
  upcomingFollowUps: number;
}

export interface SearchSessionSummary {
  id: string;
  platform: string;
  platformOther: string | null;
  queryTitle: string;
  searchedAt: string;
  isComplete: boolean;
  applicationsCount: number;
  filterDescription: string | null;
  jobPostedFrom: string;
  resultsApproxCount: number | null;
}

export interface SearchActivityOverview {
  totalSessions: number;
  linkedApplicationsCount: number;
  byPlatform: DistributionItem<string>[];
  byCompletion: DistributionItem<SearchCompletionKey>[];
  searchesPerDay: TimeSeriesPoint[];
  topQueries: Array<{ queryTitle: string; count: number }>;
  recentSessions: SearchSessionSummary[];
}
