import { useState } from 'react';
import {
  Calendar,
  Plus,
  Trash2,
  type LucideIcon,
  CheckCircle2,
  Mail,
  MessageCircle,
  AlertCircle,
  FileText,
  Send,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { useCreateEvent, useDeleteEvent, useEventsByApplication } from '@/hooks/use-events';
import { formatDateTime, formatRelative } from '@/lib/format';
import {
  ApplicationEventType,
  EventChannel,
} from '@/types/enums';
import {
  channelLabels,
  eventTypeLabels,
} from '@/types/labels';

const iconForType: Record<string, LucideIcon> = {
  application_submitted: Send,
  message_sent: MessageCircle,
  message_received: MessageCircle,
  email_sent: Mail,
  email_received: Mail,
  interview_scheduled: Calendar,
  interview_completed: CheckCircle2,
  interview_canceled: AlertCircle,
  assessment_assigned: FileText,
  assessment_submitted: FileText,
  offer_received: Star,
  offer_accepted: Star,
  offer_declined: AlertCircle,
  offer_negotiated: Star,
  feedback_received: MessageCircle,
  follow_up_sent: Send,
  rejected: AlertCircle,
  withdrawn: AlertCircle,
  ghosted_marked: AlertCircle,
  status_changed: CheckCircle2,
  stage_changed: CheckCircle2,
  note_added: FileText,
  referral_requested: MessageCircle,
  reopened: CheckCircle2,
  other: MessageCircle,
};

const enumOpts = <T extends Record<string, string>>(
  enumLike: T,
  labels: Record<string, string>,
): Array<{ value: string; label: string }> =>
  Object.values(enumLike).map((v) => ({ value: v, label: labels[v] ?? v }));

export function Timeline({ applicationId }: { applicationId: string }) {
  const { data, isLoading } = useEventsByApplication(applicationId);
  const deleteMutation = useDeleteEvent(applicationId);
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Timeline</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus size={14} /> New event
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No events recorded yet.
          </p>
        ) : (
          <ol className="space-y-4">
            {data.map((event, idx) => {
              const Icon = iconForType[event.type] ?? MessageCircle;
              const isLast = idx === data.length - 1;
              return (
                <li key={event.id} className="relative flex gap-3">
                  {!isLast ? (
                    <span className="absolute left-[15px] top-8 h-full w-px bg-border" />
                  ) : null}
                  <div className="z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary">
                    <Icon size={14} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{event.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {eventTypeLabels[event.type]}
                          {event.channel
                            ? ` · ${channelLabels[event.channel]}`
                            : ''}
                          · {formatDateTime(event.occurredAt)} (
                          {formatRelative(event.occurredAt)})
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(event.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete event"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {event.description ? (
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                        {event.description}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>

      <NewEventModal
        applicationId={applicationId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </Card>
  );
}

function NewEventModal({
  applicationId,
  open,
  onClose,
}: {
  applicationId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [type, setType] = useState<ApplicationEventType>(
    ApplicationEventType.NOTE_ADDED,
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [channel, setChannel] = useState<EventChannel | ''>('');
  const [occurredAt, setOccurredAt] = useState('');

  const mutation = useCreateEvent();

  const submit = async (): Promise<void> => {
    await mutation.mutateAsync({
      applicationId,
      type,
      title: title || eventTypeLabels[type],
      description: description || undefined,
      channel: channel || undefined,
      occurredAt: occurredAt || undefined,
    });
    setTitle('');
    setDescription('');
    setChannel('');
    setOccurredAt('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New event"
      description="Record any manual movement of the process."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label className="mb-1 block">Type</Label>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as ApplicationEventType)}
            options={enumOpts(ApplicationEventType, eventTypeLabels)}
          />
        </div>
        <div>
          <Label className="mb-1 block">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Recruiter message"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1 block">Channel</Label>
            <Select
              value={channel}
              onChange={(e) => setChannel(e.target.value as EventChannel | '')}
              options={[
                { value: '', label: 'No channel' },
                ...enumOpts(EventChannel, channelLabels),
              ]}
            />
          </div>
          <div>
            <Label className="mb-1 block">Date & time</Label>
            <Input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label className="mb-1 block">Description</Label>
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details..."
          />
        </div>
      </div>
    </Modal>
  );
}
