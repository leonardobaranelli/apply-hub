import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { eventsApi, type CreateEventInput } from '@/api/events';
import { applicationKeys } from './use-applications';

export const eventKeys = {
  byApplication: (applicationId: string) =>
    ['events', 'application', applicationId] as const,
};

export function useEventsByApplication(applicationId: string | undefined) {
  return useQuery({
    queryKey: applicationId
      ? eventKeys.byApplication(applicationId)
      : ['events', 'application', 'none'],
    queryFn: () => eventsApi.listByApplication(applicationId as string),
    enabled: Boolean(applicationId),
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) => eventsApi.create(input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: eventKeys.byApplication(variables.applicationId),
      });
      qc.invalidateQueries({
        queryKey: applicationKeys.detail(variables.applicationId),
      });
      qc.invalidateQueries({ queryKey: applicationKeys.lists() });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Event added to timeline');
    },
  });
}

export function useDeleteEvent(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => eventsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: eventKeys.byApplication(applicationId) });
      toast.success('Event deleted');
    },
  });
}
