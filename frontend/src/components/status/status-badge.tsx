import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { usePlatformSettings } from '@/context/platform-settings-context';

const statusVariant: Record<string, BadgeVariant> = {
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
  other: 'outline',
};

export function StatusBadge({ status }: { status: string }) {
  const { effectiveStatusLabels } = usePlatformSettings();
  const variant: BadgeVariant = statusVariant[status] ?? 'outline';
  const label = effectiveStatusLabels[status] ?? status;
  return <Badge variant={variant}>{label}</Badge>;
}
