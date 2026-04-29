import { api } from '@/lib/api';
import type { DashboardOverview } from '@/types/models';

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
};
