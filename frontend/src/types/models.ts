import type {
  ApplicationEventType,
  ApplicationStage,
  ApplicationStatus,
  ContactRole,
  EventChannel,
  JobPostingLanguage,
  Priority,
  SearchCompletionKey,
  TemplateType,
  WorkMode,
} from './enums';

export interface Contact {
  id: string;
  name: string;
  title: string | null;
  role: ContactRole;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  companyName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  type: ApplicationEventType;
  newStatus: ApplicationStatus | null;
  newStage: ApplicationStage | null;
  channel: EventChannel | null;
  title: string;
  description: string | null;
  occurredAt: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobSearchSession {
  id: string;
  platform: string;
  platformOther: string | null;
  queryTitle: string;
  filterDescription: string | null;
  jobPostedFrom: string;
  searchedAt: string;
  resultsApproxCount: number | null;
  isComplete: boolean;
  searchUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobApplication {
  id: string;
  companyName: string;
  companyUrl: string | null;
  roleTitle: string;
  position: string;
  jobDescription: string | null;
  jobUrl: string | null;
  location: string | null;
  workMode: WorkMode;
  employmentType: string | null;
  applicationDate: string;
  vacancyPostedDate: string;
  applicationMethod: string;
  source: string | null;
  platform: string | null;
  salaryMin: string | null;
  salaryMax: string | null;
  currency: string | null;
  salaryPeriod: string | null;
  status: ApplicationStatus;
  stage: ApplicationStage;
  priority: Priority;
  tags: string[];
  notes: string | null;
  resumeVersion: string | null;
  postingLanguage: JobPostingLanguage | null;
  contactName: string | null;
  contactLinkedin: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactOther: string | null;
  firstResponseAt: string | null;
  lastActivityAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  jobSearchSessionId: string | null;
  jobSearchSession?: {
    id: string;
    queryTitle: string;
    platform: string;
    platformOther: string | null;
    searchedAt: string;
    isComplete: boolean;
  } | null;
  contacts?: Contact[];
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
  name: string;
  type: TemplateType;
  subject: string | null;
  body: string;
  language: string | null;
  tags: string[];
  usageCount: number;
  isFavorite: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardOverview {
  kpis: {
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
  };
  byStatus: Array<{ key: ApplicationStatus; count: number; percentage: number }>;
  byPosition: Array<{ key: string; count: number; percentage: number }>;
  byMethod: Array<{ key: string; count: number; percentage: number }>;
  byWorkMode: Array<{ key: WorkMode; count: number; percentage: number }>;
  funnel: Array<{
    status: ApplicationStatus;
    count: number;
    conversionFromPrev: number | null;
    conversionFromTop: number;
  }>;
  applicationsPerDay: Array<{ date: string; count: number }>;
  activityHeatmap: Array<{ weekday: number; hour: number; count: number }>;
  methodEffectiveness: Array<{
    method: string;
    total: number;
    responseRate: number;
    interviewRate: number;
    offerRate: number;
  }>;
  topCompanies: Array<{
    companyName: string;
    applicationsCount: number;
    activeCount: number;
  }>;
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
  byPlatform: Array<{
    key: string;
    count: number;
    percentage: number;
  }>;
  byCompletion: Array<{
    key: SearchCompletionKey;
    count: number;
    percentage: number;
  }>;
  searchesPerDay: Array<{ date: string; count: number }>;
  topQueries: Array<{ queryTitle: string; count: number }>;
  recentSessions: SearchSessionSummary[];
}
