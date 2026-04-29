export enum PositionType {
  BACKEND = 'backend',
  FULLSTACK = 'fullstack',
  AI_DEVELOPER = 'ai_developer',
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
}

export enum EmploymentType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACT = 'contract',
  INTERNSHIP = 'internship',
  FREELANCE = 'freelance',
}

/**
 * Macro status of the pipeline. Defines the main phase the application
 * is currently in.
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
}

/**
 * Granular stage within the macro status. Allows distinguishing between
 * different interview rounds, for example.
 */
export enum ApplicationStage {
  SUBMITTED = 'submitted',
  AUTO_REPLY = 'auto_reply',
  RECRUITER_SCREEN = 'recruiter_screen',
  HIRING_MANAGER_SCREEN = 'hiring_manager_screen',
  TAKE_HOME = 'take_home',
  LIVE_CODING = 'live_coding',
  TECH_INTERVIEW_1 = 'tech_interview_1',
  TECH_INTERVIEW_2 = 'tech_interview_2',
  SYSTEM_DESIGN = 'system_design',
  BEHAVIORAL = 'behavioral',
  CULTURE_FIT = 'culture_fit',
  TEAM_MATCH = 'team_match',
  FINAL_ROUND = 'final_round',
  REFERENCE_CHECK = 'reference_check',
  OFFER_RECEIVED = 'offer_received',
  OFFER_NEGOTIATION = 'offer_negotiation',
  OFFER_ACCEPTED = 'offer_accepted',
  OFFER_DECLINED = 'offer_declined',
  CLOSED = 'closed',
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
  ApplicationStatus.ACCEPTED,
];

export const isActiveStatus = (status: ApplicationStatus): boolean =>
  ACTIVE_STATUSES.has(status);

export const isTerminalStatus = (status: ApplicationStatus): boolean =>
  TERMINAL_STATUSES.has(status);

export const funnelIndex = (status: ApplicationStatus): number =>
  FUNNEL_ORDER.indexOf(status);
