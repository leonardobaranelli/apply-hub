import { api } from '@/lib/api';
import type {
  ApplicationEventType,
  ApplicationStage,
  ApplicationStatus,
  EventChannel,
} from '@/types/enums';
import type { ApplicationEvent } from '@/types/models';

export interface CreateEventInput {
  applicationId: string;
  type: ApplicationEventType;
  title: string;
  description?: string;
  channel?: EventChannel;
  newStatus?: ApplicationStatus;
  newStage?: ApplicationStage;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

export const eventsApi = {
  listByApplication: async (
    applicationId: string,
  ): Promise<ApplicationEvent[]> => {
    const { data } = await api.get<ApplicationEvent[]>(
      `/applications/${applicationId}/events`,
    );
    return data;
  },
  create: async (input: CreateEventInput): Promise<ApplicationEvent> => {
    const { data } = await api.post<ApplicationEvent>('/events', input);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/events/${id}`);
  },
};
