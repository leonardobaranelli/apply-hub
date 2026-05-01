import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard';

interface Params {
  fromDate?: string;
  toDate?: string;
}

export function useDashboard(params: Params = {}) {
  return useQuery({
    queryKey: ['dashboard', 'overview', params],
    queryFn: () => dashboardApi.getOverview(params),
  });
}

export function useSearchActivity(params: Params = {}) {
  return useQuery({
    queryKey: ['dashboard', 'search-activity', params],
    queryFn: () => dashboardApi.getSearchActivity(params),
  });
}
