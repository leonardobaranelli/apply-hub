import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  searchSessionsApi,
  type CreateSearchSessionInput,
  type SearchSessionFilters,
  type UpdateSearchSessionInput,
} from '@/api/search-sessions';

export const searchSessionKeys = {
  all: ['search-sessions'] as const,
  list: (params: SearchSessionFilters) =>
    ['search-sessions', 'list', params] as const,
};

export function useSearchSessionsList(params: SearchSessionFilters = {}) {
  return useQuery({
    queryKey: searchSessionKeys.list(params),
    queryFn: () => searchSessionsApi.list(params),
  });
}

export function useCreateSearchSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSearchSessionInput) =>
      searchSessionsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: searchSessionKeys.all });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Search session saved');
    },
  });
}

export function useUpdateSearchSession(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSearchSessionInput) =>
      searchSessionsApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: searchSessionKeys.all });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Search session updated');
    },
  });
}

export function useDeleteSearchSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sid: string) => searchSessionsApi.remove(sid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: searchSessionKeys.all });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Search session deleted');
    },
  });
}
