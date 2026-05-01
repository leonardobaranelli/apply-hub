import { api } from '@/lib/api';
import type { DashboardOverview, SearchActivityOverview } from '@/types/models';

export const dashboardApi = {
  getOverview: async (params?: {
    fromDate?: string;
    toDate?: string;
  }): Promise<DashboardOverview> => {
    const { data } = await api.get<DashboardOverview>('/dashboard', {
      params,
    });
    return data;
  },

  getSearchActivity: async (params?: {
    fromDate?: string;
    toDate?: string;
  }): Promise<SearchActivityOverview> => {
    const { data } = await api.get<SearchActivityOverview>(
      '/dashboard/search-activity',
      { params },
    );
    return data;
  },
};
