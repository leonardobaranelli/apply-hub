import { api, type Paginated } from '@/lib/api';
import type {
  ApplicationStage,
  ApplicationStatus,
  EventChannel,
  JobPostingLanguage,
  Priority,
  WorkMode,
} from '@/types/enums';
import type { JobApplication } from '@/types/models';

export interface CreateApplicationInput {
  companyName: string;
  companyUrl?: string | null;
  roleTitle: string;
  jobTitle: string;
  position?: string;
  jobDescription?: string | null;
  jobUrl?: string | null;
  location?: string | null;
  workMode?: WorkMode;
  employmentType?: string | null;
  applicationDate?: string;
  vacancyPostedDate?: string;
  applicationMethod?: string;
  source?: string | null;
  platform?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  salaryPeriod?: string | null;
  priority?: Priority;
  tags?: string[];
  notes?: string | null;
  resumeVersion?: string | null;
  postingLanguage?: JobPostingLanguage | null;
  contactName?: string | null;
  contactLinkedin?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactOther?: string | null;
  jobSearchSessionId?: string | null;
}

export type UpdateApplicationInput = Partial<CreateApplicationInput>;

export interface ApplicationFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ApplicationStatus[];
  stage?: ApplicationStage[];
  position?: string[];
  method?: string[];
  workMode?: WorkMode[];
  priority?: Priority[];
  companyName?: string;
  fromDate?: string;
  toDate?: string;
  includeArchived?: boolean;
  onlyActive?: boolean;
  tags?: string[];
  sortBy?:
    | 'applicationDate'
    | 'createdAt'
    | 'updatedAt'
    | 'status'
    | 'priority'
    | 'lastActivityAt';
  sortDir?: 'asc' | 'desc';
}

export interface ChangeStatusInput {
  status: ApplicationStatus;
  stage?: ApplicationStage;
  title?: string;
  description?: string;
  channel?: EventChannel;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

const stripUndefined = <T extends Record<string, unknown>>(input: T): T =>
  Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as T;

const toCsvList = (input: unknown): string | undefined => {
  if (!input) return undefined;
  if (Array.isArray(input)) return input.length ? input.join(',') : undefined;
  return String(input);
};

export const applicationsApi = {
  list: async (
    filters: ApplicationFilters = {},
  ): Promise<Paginated<JobApplication>> => {
    const params = stripUndefined({
      page: filters.page,
      limit: filters.limit,
      search: filters.search,
      status: toCsvList(filters.status),
      stage: toCsvList(filters.stage),
      position: toCsvList(filters.position),
      method: toCsvList(filters.method),
      workMode: toCsvList(filters.workMode),
      priority: toCsvList(filters.priority),
      tags: toCsvList(filters.tags),
      companyName: filters.companyName,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      includeArchived: filters.includeArchived,
      onlyActive: filters.onlyActive,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    });
    const { data } = await api.get<Paginated<JobApplication>>('/applications', {
      params,
    });
    return data;
  },

  getById: async (id: string): Promise<JobApplication> => {
    const { data } = await api.get<JobApplication>(`/applications/${id}`);
    return data;
  },

  create: async (input: CreateApplicationInput): Promise<JobApplication> => {
    const { data } = await api.post<JobApplication>('/applications', input);
    return data;
  },

  update: async (
    id: string,
    input: UpdateApplicationInput,
  ): Promise<JobApplication> => {
    const body = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    );
    const { data } = await api.patch<JobApplication>(
      `/applications/${id}`,
      body,
    );
    return data;
  },

  changeStatus: async (
    id: string,
    input: ChangeStatusInput,
  ): Promise<JobApplication> => {
    const { data } = await api.patch<JobApplication>(
      `/applications/${id}/status`,
      input,
    );
    return data;
  },

  archive: async (id: string): Promise<JobApplication> => {
    const { data } = await api.patch<JobApplication>(
      `/applications/${id}/archive`,
    );
    return data;
  },

  restore: async (id: string): Promise<JobApplication> => {
    const { data } = await api.patch<JobApplication>(
      `/applications/${id}/restore`,
    );
    return data;
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/applications/${id}`);
  },

  markStaleAsGhosted: async (
    days = 21,
  ): Promise<{ ghostedCount: number }> => {
    const { data } = await api.post<{ ghostedCount: number }>(
      '/applications/mark-stale-ghosted',
      null,
      { params: { days } },
    );
    return data;
  },
};
