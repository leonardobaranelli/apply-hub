import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  applicationsApi,
  type ApplicationFilters,
  type ChangeStatusInput,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from '@/api/applications';

const APPLICATIONS_KEY = ['applications'] as const;

export const applicationKeys = {
  all: APPLICATIONS_KEY,
  lists: () => [...APPLICATIONS_KEY, 'list'] as const,
  list: (filters: ApplicationFilters) =>
    [...APPLICATIONS_KEY, 'list', filters] as const,
  detail: (id: string) => [...APPLICATIONS_KEY, 'detail', id] as const,
};

export function useApplicationsList(filters: ApplicationFilters) {
  return useQuery({
    queryKey: applicationKeys.list(filters),
    queryFn: () => applicationsApi.list(filters),
  });
}

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: id ? applicationKeys.detail(id) : ['applications', 'detail', 'none'],
    queryFn: () => applicationsApi.getById(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApplicationInput) => applicationsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['search-sessions'] });
      toast.success('Application created');
    },
  });
}

export function useUpdateApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateApplicationInput) =>
      applicationsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['search-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Application updated');
    },
  });
}

export function useChangeStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeStatusInput) =>
      applicationsApi.changeStatus(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: ['events', 'application', id],
      });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Status updated');
    },
  });
}

export function useArchiveApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => applicationsApi.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
      toast.success('Application archived');
    },
  });
}

export function useRestoreApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => applicationsApi.restore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
      toast.success('Application restored');
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => applicationsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
      toast.success('Application deleted');
    },
  });
}

export function useMarkStaleAsGhosted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (days?: number) => applicationsApi.markStaleAsGhosted(days),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`${data.ghostedCount} applications marked as ghosted`);
    },
  });
}
