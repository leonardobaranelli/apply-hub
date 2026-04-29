import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  accent?: 'primary' | 'success' | 'warning' | 'info' | 'destructive';
  className?: string;
}

const accentClasses: Record<NonNullable<KpiCardProps['accent']>, string> = {
  primary: 'text-primary bg-primary/10',
  success: 'text-success bg-success/10',
  warning: 'text-warning bg-warning/10',
  info: 'text-info bg-info/10',
  destructive: 'text-destructive bg-destructive/10',
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = 'primary',
  className,
}: KpiCardProps) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
          {hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {Icon ? (
          <div className={cn('rounded-lg p-2', accentClasses[accent])}>
            <Icon size={18} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
