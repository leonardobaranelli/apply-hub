import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  return format(date, 'MMM d, yyyy', { locale: enUS });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  return format(date, "MMM d, yyyy 'at' HH:mm", { locale: enUS });
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  return formatDistanceToNowStrict(date, { locale: enUS, addSuffix: true });
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatSalaryRange(
  min: string | null,
  max: string | null,
  currency: string | null,
  period: string | null,
): string | null {
  if (!min && !max) return null;
  const fmt = (v: string | null): string =>
    v ? new Intl.NumberFormat('en-US').format(parseFloat(v)) : '?';
  const cur = currency ? ` ${currency}` : '';
  const per = period ? ` / ${period}` : '';
  if (min && max) return `${fmt(min)} – ${fmt(max)}${cur}${per}`;
  return `${fmt(min ?? max)}${cur}${per}`;
}

export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}
