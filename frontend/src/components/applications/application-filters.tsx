import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ApplicationStatus, Priority } from '@/types/enums';
import { usePlatformSettings } from '@/context/platform-settings-context';
import { priorityLabels, statusLabels } from '@/types/labels';
import type { ApplicationFilters as Filters } from '@/api/applications';

interface Props {
  value: Filters;
  onChange: (next: Filters) => void;
}

const allOption = { value: '', label: 'All' };

const enumOpts = <T extends Record<string, string>>(
  enumLike: T,
  labels: Record<string, string>,
): Array<{ value: string; label: string }> => [
  allOption,
  ...Object.values(enumLike).map((v) => ({ value: v, label: labels[v] ?? v })),
];

export function ApplicationFiltersBar({ value, onChange }: Props) {
  const {
    methodSelectOptions,
    workModeSelectOptions,
    positionSelectOptions,
  } = usePlatformSettings();

  const update = <K extends keyof Filters>(key: K, val: Filters[K]): void => {
    onChange({ ...value, [key]: val, page: 1 });
  };

  const updateSingleArray = (
    key: 'status' | 'position' | 'method' | 'workMode' | 'priority',
    raw: string,
  ): void => {
    onChange({
      ...value,
      [key]: raw ? [raw] : undefined,
      page: 1,
    });
  };

  const hasFilters =
    Boolean(value.search) ||
    (value.status?.length ?? 0) > 0 ||
    (value.position?.length ?? 0) > 0 ||
    (value.method?.length ?? 0) > 0 ||
    (value.workMode?.length ?? 0) > 0 ||
    (value.priority?.length ?? 0) > 0 ||
    Boolean(value.fromDate) ||
    Boolean(value.toDate) ||
    Boolean(value.onlyActive);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search by role, company or notes..."
            value={value.search ?? ''}
            onChange={(e) => update('search', e.target.value || undefined)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={value.status?.[0] ?? ''}
            onChange={(e) => updateSingleArray('status', e.target.value)}
            options={enumOpts(ApplicationStatus, statusLabels)}
            className="h-9 min-w-[140px]"
          />
          <Select
            value={value.position?.[0] ?? ''}
            onChange={(e) => updateSingleArray('position', e.target.value)}
            options={[
              allOption,
              ...positionSelectOptions.map((o) => ({
                value: o.value,
                label: o.label,
              })),
            ]}
            className="h-9 min-w-[140px]"
          />
          <Select
            value={value.method?.[0] ?? ''}
            onChange={(e) => updateSingleArray('method', e.target.value)}
            options={[
              allOption,
              ...methodSelectOptions.map((o) => ({
                value: o.value,
                label: o.label,
              })),
            ]}
            className="h-9 min-w-[180px]"
          />
          <Select
            value={value.workMode?.[0] ?? ''}
            onChange={(e) => updateSingleArray('workMode', e.target.value)}
            options={[
              allOption,
              ...workModeSelectOptions.map((o) => ({
                value: o.value,
                label: o.label,
              })),
            ]}
            className="h-9 min-w-[120px]"
          />
          <Select
            value={value.priority?.[0] ?? ''}
            onChange={(e) => updateSingleArray('priority', e.target.value)}
            options={enumOpts(Priority, priorityLabels)}
            className="h-9 min-w-[100px]"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={value.onlyActive ?? false}
              onChange={(e) => update('onlyActive', e.target.checked || undefined)}
              className="h-3.5 w-3.5 rounded border-border bg-background"
            />
            Only active
          </label>
          {hasFilters ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onChange({ page: 1, limit: value.limit ?? 25, sortBy: 'applicationDate', sortDir: 'desc' })
              }
            >
              <X size={14} /> Clear
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
