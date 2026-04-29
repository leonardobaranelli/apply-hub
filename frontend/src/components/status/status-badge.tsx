import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { ApplicationStatus } from '@/types/enums';
import { statusLabels } from '@/types/labels';

const statusVariant: Record<ApplicationStatus, BadgeVariant> = {
  applied: 'info',
  acknowledged: 'info',
  screening: 'default',
  assessment: 'warning',
  interview: 'default',
  offer: 'success',
  negotiating: 'success',
  accepted: 'success',
  rejected: 'destructive',
  withdrawn: 'secondary',
  ghosted: 'secondary',
  on_hold: 'outline',
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge variant={statusVariant[status]}>{statusLabels[status]}</Badge>;
}
