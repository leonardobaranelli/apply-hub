export const PositionType = {
  BACKEND: 'backend',
  FULLSTACK: 'fullstack',
  AI_DEVELOPER: 'ai_developer',
} as const;
export type PositionType = (typeof PositionType)[keyof typeof PositionType];

export const ApplicationMethod = {
  EMAIL: 'email',
  LINKEDIN_EASY_APPLY: 'linkedin_easy_apply',
  LINKEDIN_EXTERNAL: 'linkedin_external',
  COMPANY_WEBSITE: 'company_website',
  JOB_BOARD: 'job_board',
  REFERRAL: 'referral',
  RECRUITER_OUTREACH: 'recruiter_outreach',
  OTHER: 'other',
} as const;
export type ApplicationMethod =
  (typeof ApplicationMethod)[keyof typeof ApplicationMethod];

export const WorkMode = {
  REMOTE: 'remote',
  HYBRID: 'hybrid',
  ONSITE: 'onsite',
  UNKNOWN: 'unknown',
} as const;
export type WorkMode = (typeof WorkMode)[keyof typeof WorkMode];

export const EmploymentType = {
  FULL_TIME: 'full_time',
  PART_TIME: 'part_time',
  CONTRACT: 'contract',
  INTERNSHIP: 'internship',
  FREELANCE: 'freelance',
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

export const ApplicationStatus = {
  APPLIED: 'applied',
  ACKNOWLEDGED: 'acknowledged',
  SCREENING: 'screening',
  ASSESSMENT: 'assessment',
  INTERVIEW: 'interview',
  OFFER: 'offer',
  NEGOTIATING: 'negotiating',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  GHOSTED: 'ghosted',
  ON_HOLD: 'on_hold',
} as const;
export type ApplicationStatus =
  (typeof ApplicationStatus)[keyof typeof ApplicationStatus];

export const ApplicationStage = {
  SUBMITTED: 'submitted',
  AUTO_REPLY: 'auto_reply',
  RECRUITER_SCREEN: 'recruiter_screen',
  HIRING_MANAGER_SCREEN: 'hiring_manager_screen',
  TAKE_HOME: 'take_home',
  LIVE_CODING: 'live_coding',
  TECH_INTERVIEW_1: 'tech_interview_1',
  TECH_INTERVIEW_2: 'tech_interview_2',
  SYSTEM_DESIGN: 'system_design',
  BEHAVIORAL: 'behavioral',
  CULTURE_FIT: 'culture_fit',
  TEAM_MATCH: 'team_match',
  FINAL_ROUND: 'final_round',
  REFERENCE_CHECK: 'reference_check',
  OFFER_RECEIVED: 'offer_received',
  OFFER_NEGOTIATION: 'offer_negotiation',
  OFFER_ACCEPTED: 'offer_accepted',
  OFFER_DECLINED: 'offer_declined',
  CLOSED: 'closed',
} as const;
export type ApplicationStage =
  (typeof ApplicationStage)[keyof typeof ApplicationStage];

export const Priority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const TemplateType = {
  COVER_LETTER: 'cover_letter',
  EMAIL: 'email',
  LINKEDIN_MESSAGE: 'linkedin_message',
  LINKEDIN_CONNECTION: 'linkedin_connection',
  FOLLOW_UP: 'follow_up',
  THANK_YOU: 'thank_you',
  REFERRAL_REQUEST: 'referral_request',
  ANSWER: 'answer',
  OTHER: 'other',
} as const;
export type TemplateType = (typeof TemplateType)[keyof typeof TemplateType];

export const ApplicationEventType = {
  APPLICATION_SUBMITTED: 'application_submitted',
  STATUS_CHANGED: 'status_changed',
  STAGE_CHANGED: 'stage_changed',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',
  EMAIL_SENT: 'email_sent',
  EMAIL_RECEIVED: 'email_received',
  INTERVIEW_SCHEDULED: 'interview_scheduled',
  INTERVIEW_COMPLETED: 'interview_completed',
  INTERVIEW_CANCELED: 'interview_canceled',
  ASSESSMENT_ASSIGNED: 'assessment_assigned',
  ASSESSMENT_SUBMITTED: 'assessment_submitted',
  OFFER_RECEIVED: 'offer_received',
  OFFER_NEGOTIATED: 'offer_negotiated',
  OFFER_ACCEPTED: 'offer_accepted',
  OFFER_DECLINED: 'offer_declined',
  FEEDBACK_RECEIVED: 'feedback_received',
  FOLLOW_UP_SENT: 'follow_up_sent',
  REFERRAL_REQUESTED: 'referral_requested',
  NOTE_ADDED: 'note_added',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  GHOSTED_MARKED: 'ghosted_marked',
  REOPENED: 'reopened',
  OTHER: 'other',
} as const;
export type ApplicationEventType =
  (typeof ApplicationEventType)[keyof typeof ApplicationEventType];

export const EventChannel = {
  EMAIL: 'email',
  LINKEDIN: 'linkedin',
  PHONE: 'phone',
  VIDEO_CALL: 'video_call',
  IN_PERSON: 'in_person',
  PLATFORM: 'platform',
  OTHER: 'other',
} as const;
export type EventChannel = (typeof EventChannel)[keyof typeof EventChannel];

export const ContactRole = {
  RECRUITER: 'recruiter',
  HIRING_MANAGER: 'hiring_manager',
  ENGINEER: 'engineer',
  REFERRAL: 'referral',
  OTHER: 'other',
} as const;
export type ContactRole = (typeof ContactRole)[keyof typeof ContactRole];

export const ACTIVE_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.APPLIED,
  ApplicationStatus.ACKNOWLEDGED,
  ApplicationStatus.SCREENING,
  ApplicationStatus.ASSESSMENT,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.OFFER,
  ApplicationStatus.NEGOTIATING,
  ApplicationStatus.ON_HOLD,
];

export const SearchPlatform = {
  LINKEDIN: 'linkedin',
  GOOGLE: 'google',
  INDEED: 'indeed',
  GLASSDOOR: 'glassdoor',
  JOB_BOARD: 'job_board',
  COMPANY_SITE: 'company_site',
  RECRUITER_PORTAL: 'recruiter_portal',
  OTHER: 'other',
} as const;
export type SearchPlatform = (typeof SearchPlatform)[keyof typeof SearchPlatform];

export const SearchCompletionKey = {
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
} as const;
export type SearchCompletionKey =
  (typeof SearchCompletionKey)[keyof typeof SearchCompletionKey];
