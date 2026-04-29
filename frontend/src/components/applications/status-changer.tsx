import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useChangeStatus } from '@/hooks/use-applications';
import {
  ApplicationStage,
  ApplicationStatus,
  EventChannel,
} from '@/types/enums';
import {
  channelLabels,
  stageLabels,
  statusLabels,
} from '@/types/labels';

const enumOpts = <T extends Record<string, string>>(
  enumLike: T,
  labels: Record<string, string>,
): Array<{ value: string; label: string }> =>
  Object.values(enumLike).map((v) => ({ value: v, label: labels[v] ?? v }));

interface Props {
  applicationId: string;
  currentStatus: ApplicationStatus;
  currentStage: ApplicationStage;
}

export function StatusChanger({
  applicationId,
  currentStatus,
  currentStage,
}: Props) {
  const [status, setStatus] = useState<ApplicationStatus>(currentStatus);
  const [stage, setStage] = useState<ApplicationStage>(currentStage);
  const [channel, setChannel] = useState<EventChannel | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useChangeStatus(applicationId);

  const submit = async (): Promise<void> => {
    await mutation.mutateAsync({
      status,
      stage,
      title: title || undefined,
      description: description || undefined,
      channel: channel || undefined,
    });
    setTitle('');
    setDescription('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Move application</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label className="mb-1 block">Status</Label>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
              options={enumOpts(ApplicationStatus, statusLabels)}
            />
          </div>
          <div>
            <Label className="mb-1 block">Stage</Label>
            <Select
              value={stage}
              onChange={(e) => setStage(e.target.value as ApplicationStage)}
              options={enumOpts(ApplicationStage, stageLabels)}
            />
          </div>
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
            <Label className="mb-1 block">Event title (optional)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Recruiter call"
            />
          </div>
        </div>
        <div>
          <Label className="mb-1 block">Notes / Description</Label>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Movement details..."
          />
        </div>
        <div className="flex items-center justify-end">
          <Button onClick={submit} loading={mutation.isPending}>
            Apply change
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
