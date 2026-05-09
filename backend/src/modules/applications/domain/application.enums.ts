export enum PositionType {
  BACKEND = 'backend',
  FULLSTACK = 'fullstack',
  AI_DEVELOPER = 'ai_developer',
  OTHER = 'other',
}

export enum ApplicationMethod {
  EMAIL = 'email',
  LINKEDIN_EASY_APPLY = 'linkedin_easy_apply',
  LINKEDIN_EXTERNAL = 'linkedin_external',
  COMPANY_WEBSITE = 'company_website',
  JOB_BOARD = 'job_board',
  REFERRAL = 'referral',
  RECRUITER_OUTREACH = 'recruiter_outreach',
  OTHER = 'other',
}

export enum WorkMode {
  REMOTE = 'remote',
  HYBRID = 'hybrid',
  ONSITE = 'onsite',
  UNKNOWN = 'unknown',
  OTHER = 'other',
}

export enum EmploymentType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACT = 'contract',
  INTERNSHIP = 'internship',
  FREELANCE = 'freelance',
  OTHER = 'other',
}

/**
 * Macro status of the pipeline. Defines the main phase the application
 * is currently in. Persisted as VARCHAR so users can extend the
 * vocabulary from Settings (`formConfig.customApplicationStatuses`).
 */
export enum ApplicationStatus {
  APPLIED = 'applied',
  ACKNOWLEDGED = 'acknowledged',
  SCREENING = 'screening',
  ASSESSMENT = 'assessment',
  INTERVIEW = 'interview',
  OFFER = 'offer',
  NEGOTIATING = 'negotiating',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
  GHOSTED = 'ghosted',
  ON_HOLD = 'on_hold',
  OTHER = 'other',
}

/**
 * Granular stage within the macro status. Persisted as VARCHAR so
 * users can extend the vocabulary from Settings
 * (`formConfig.customApplicationStages`).
 */
export enum ApplicationStage {
  SUBMITTED = 'submitted',
  AUTO_REPLY = 'auto_reply',
  RECRUITER_SCREEN = 'recruiter_screen',
  HIRING_MANAGER_SCREEN = 'hiring_manager_screen',
  TAKE_HOME = 'take_home',
  TECH_INTERVIEW_1 = 'tech_interview_1',
  TECH_INTERVIEW_2 = 'tech_interview_2',
  BEHAVIORAL = 'behavioral',
  CULTURE_FIT = 'culture_fit',
  OFFER_RECEIVED = 'offer_received',
  OFFER_NEGOTIATION = 'offer_negotiation',
  OFFER_ACCEPTED = 'offer_accepted',
  OFFER_DECLINED = 'offer_declined',
  CLOSED = 'closed',
  OTHER = 'other',
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Statuses that mean the application is still active.
 */
export const ACTIVE_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  ApplicationStatus.APPLIED,
  ApplicationStatus.ACKNOWLEDGED,
  ApplicationStatus.SCREENING,
  ApplicationStatus.ASSESSMENT,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.OFFER,
  ApplicationStatus.NEGOTIATING,
  ApplicationStatus.ON_HOLD,
]);

/**
 * Terminal statuses (no further transitions expected).
 */
export const TERMINAL_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  ApplicationStatus.ACCEPTED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.GHOSTED,
]);

/**
 * Logical funnel order (used for conversion metrics).
 */
export const FUNNEL_ORDER: readonly ApplicationStatus[] = [
  ApplicationStatus.APPLIED,
  ApplicationStatus.ACKNOWLEDGED,
  ApplicationStatus.SCREENING,
  ApplicationStatus.ASSESSMENT,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.OFFER,
  ApplicationStatus.NEGOTIATING,
];

export const isActiveStatus = (status: string): boolean =>
  ACTIVE_STATUSES.has(status as ApplicationStatus);

export const isTerminalStatus = (status: string): boolean =>
  TERMINAL_STATUSES.has(status as ApplicationStatus);

export const funnelIndex = (status: string): number => {
  const s = status as ApplicationStatus;
  if (s === ApplicationStatus.ACCEPTED) return FUNNEL_ORDER.length;
  return FUNNEL_ORDER.indexOf(s);
};
