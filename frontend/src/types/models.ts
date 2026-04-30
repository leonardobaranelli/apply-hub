import type {
  ApplicationEventType,
  ApplicationMethod,
  ApplicationStage,
  ApplicationStatus,
  ContactRole,
  EmploymentType,
  EventChannel,
  PositionType,
  Priority,
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

export interface JobApplication {
  id: string;
  companyName: string;
  companyUrl: string | null;
  roleTitle: string;
  position: PositionType;
  jobDescription: string | null;
  jobUrl: string | null;
  location: string | null;
  workMode: WorkMode;
  employmentType: EmploymentType | null;
  applicationDate: string;
  applicationMethod: ApplicationMethod;
  source: string | null;
  platform: string | null;
  salaryMin: string | null;
  salaryMax: string | null;
  currency: string | null;
  salaryPeriod: string | null;
  status: ApplicationStatus;
  stage: ApplicationStage;
  priority: Priority;
  excitement: number | null;
  tags: string[];
  notes: string | null;
  resumeVersion: string | null;
  contactName: string | null;
  contactLinkedin: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactOther: string | null;
  firstResponseAt: string | null;
  lastActivityAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
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
  byPosition: Array<{ key: PositionType; count: number; percentage: number }>;
  byMethod: Array<{ key: ApplicationMethod; count: number; percentage: number }>;
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
    method: ApplicationMethod;
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
