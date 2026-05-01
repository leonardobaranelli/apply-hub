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
  SearchCompletionKey,
  SearchPlatform,
  TemplateType,
  WorkMode,
} from './enums';

export const positionLabels: Record<PositionType, string> = {
  backend: 'Backend',
  fullstack: 'Full Stack',
  ai_developer: 'AI Developer',
};

export const methodLabels: Record<ApplicationMethod, string> = {
  email: 'Direct email',
  linkedin_easy_apply: 'LinkedIn Easy Apply',
  linkedin_external: 'LinkedIn → External platform',
  company_website: 'Company website',
  job_board: 'Job board',
  referral: 'Referral',
  recruiter_outreach: 'Recruiter outreach',
  other: 'Other',
};

export const workModeLabels: Record<WorkMode, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
  unknown: 'Unspecified',
};

export const employmentLabels: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
  freelance: 'Freelance',
};

export const statusLabels: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  acknowledged: 'Acknowledged',
  screening: 'Screening',
  assessment: 'Assessment',
  interview: 'Interviewing',
  offer: 'Offer',
  negotiating: 'Negotiating',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  ghosted: 'Ghosted',
  on_hold: 'On hold',
};

export const stageLabels: Record<ApplicationStage, string> = {
  submitted: 'Submitted',
  auto_reply: 'Auto-reply',
  recruiter_screen: 'Recruiter screen',
  hiring_manager_screen: 'Hiring manager screen',
  take_home: 'Take-home',
  live_coding: 'Live coding',
  tech_interview_1: 'Tech interview 1',
  tech_interview_2: 'Tech interview 2',
  system_design: 'System design',
  behavioral: 'Behavioral',
  culture_fit: 'Culture fit',
  team_match: 'Team match',
  final_round: 'Final round',
  reference_check: 'Reference check',
  offer_received: 'Offer received',
  offer_negotiation: 'Offer negotiation',
  offer_accepted: 'Offer accepted',
  offer_declined: 'Offer declined',
  closed: 'Closed',
};

export const priorityLabels: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const templateLabels: Record<TemplateType, string> = {
  cover_letter: 'Cover letter',
  email: 'Email',
  linkedin_message: 'LinkedIn message',
  linkedin_connection: 'LinkedIn connection',
  follow_up: 'Follow-up',
  thank_you: 'Thank you',
  referral_request: 'Referral request',
  answer: 'Question answer',
  other: 'Other',
};

export const eventTypeLabels: Record<ApplicationEventType, string> = {
  application_submitted: 'Application submitted',
  status_changed: 'Status changed',
  stage_changed: 'Stage changed',
  message_sent: 'Message sent',
  message_received: 'Message received',
  email_sent: 'Email sent',
  email_received: 'Email received',
  interview_scheduled: 'Interview scheduled',
  interview_completed: 'Interview completed',
  interview_canceled: 'Interview canceled',
  assessment_assigned: 'Assessment assigned',
  assessment_submitted: 'Assessment submitted',
  offer_received: 'Offer received',
  offer_negotiated: 'Offer negotiated',
  offer_accepted: 'Offer accepted',
  offer_declined: 'Offer declined',
  feedback_received: 'Feedback received',
  follow_up_sent: 'Follow-up sent',
  referral_requested: 'Referral requested',
  note_added: 'Note added',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  ghosted_marked: 'Ghosted',
  reopened: 'Reopened',
  other: 'Other',
};

export const channelLabels: Record<EventChannel, string> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  phone: 'Phone',
  video_call: 'Video call',
  in_person: 'In person',
  platform: 'Platform',
  other: 'Other',
};

export const contactRoleLabels: Record<ContactRole, string> = {
  recruiter: 'Recruiter',
  hiring_manager: 'Hiring Manager',
  engineer: 'Engineer',
  referral: 'Referral',
  other: 'Other',
};

export const searchPlatformLabels: Record<SearchPlatform, string> = {
  linkedin: 'LinkedIn',
  google: 'Google',
  indeed: 'Indeed',
  glassdoor: 'Glassdoor',
  job_board: 'Job board',
  company_site: 'Company site',
  recruiter_portal: 'Recruiter portal',
  other: 'Other',
};

export const searchCompletionLabels: Record<SearchCompletionKey, string> = {
  complete: 'Complete',
  active: 'Active',
};
