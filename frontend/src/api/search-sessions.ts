import { api, type Paginated } from '@/lib/api';
import type { JobSearchSession } from '@/types/models';

export interface CreateSearchSessionInput {
  platform: string;
  platformOther?: string | null;
  queryTitle: string;
  filterDescription?: string | null;
  jobPostedFrom?: string | null;
  searchedAt?: string | null;
  resultsApproxCount?: number | null;
  isComplete?: boolean;
  searchUrl?: string | null;
  notes?: string | null;
}

export type UpdateSearchSessionInput = Partial<CreateSearchSessionInput>;

export interface SearchSessionFilters {
  page?: number;
  limit?: number;
  search?: string;
  platform?: string;
  fromDate?: string;
  toDate?: string;
}

const stripUndefined = <T extends Record<string, unknown>>(input: T): T =>
  Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  ) as T;

export const searchSessionsApi = {
  list: async (
    filters: SearchSessionFilters = {},
  ): Promise<Paginated<JobSearchSession>> => {
    const params = stripUndefined({
      page: filters.page,
      limit: filters.limit,
      search: filters.search,
      platform: filters.platform,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
    });
    const { data } = await api.get<Paginated<JobSearchSession>>(
      '/search-sessions',
      { params },
    );
    return data;
  },

  getById: async (id: string): Promise<JobSearchSession & { _count?: { applications: number } }> => {
    const { data } = await api.get(`/search-sessions/${id}`);
    return data;
  },

  create: async (input: CreateSearchSessionInput): Promise<JobSearchSession> => {
    const { data } = await api.post<JobSearchSession>(
      '/search-sessions',
      input,
    );
    return data;
  },

  update: async (
    id: string,
    input: UpdateSearchSessionInput,
  ): Promise<JobSearchSession> => {
    const body = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    );
    const { data } = await api.patch<JobSearchSession>(
      `/search-sessions/${id}`,
      body,
    );
    return data;
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/search-sessions/${id}`);
  },
};
