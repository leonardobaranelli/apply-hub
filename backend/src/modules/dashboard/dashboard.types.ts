import {
  ApplicationMethod,
  ApplicationStatus,
  PositionType,
  WorkMode,
} from '../applications/domain/application.enums';

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
  method: ApplicationMethod;
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
  byPosition: DistributionItem<PositionType>[];
  byMethod: DistributionItem<ApplicationMethod>[];
  byWorkMode: DistributionItem<WorkMode>[];
  funnel: FunnelStep[];
  applicationsPerDay: TimeSeriesPoint[];
  activityHeatmap: ActivityHeatmapCell[];
  methodEffectiveness: MethodEffectiveness[];
  topCompanies: TopCompany[];
  upcomingFollowUps: number;
}
