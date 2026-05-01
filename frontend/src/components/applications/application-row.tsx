import { Link } from 'react-router-dom';
import { ArrowUpRight, Calendar, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status/status-badge';
import { usePlatformSettings } from '@/context/platform-settings-context';
import { formatDate, formatRelative, formatSalaryRange } from '@/lib/format';
import { stageLabels } from '@/types/labels';
import type { JobApplication } from '@/types/models';

interface Props {
  application: JobApplication;
}

export function ApplicationRow({ application }: Props) {
  const {
    effectiveMethodLabels,
    effectiveWorkModeLabels,
    effectivePositionLabels,
  } = usePlatformSettings();
  const salary = formatSalaryRange(
    application.salaryMin,
    application.salaryMax,
    application.currency,
    application.salaryPeriod,
  );

  return (
    <Link
      to={`/applications/${application.id}`}
      className="group flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md"
    >
      <div className="flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold leading-tight">
            {application.roleTitle}
          </h3>
          <span className="text-sm text-muted-foreground">
            · {application.companyName}
          </span>
          <ArrowUpRight
            size={16}
            className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={application.status} />
          <Badge variant="outline">{stageLabels[application.stage]}</Badge>
          <Badge variant="secondary">
            {effectivePositionLabels[application.position] ??
              application.position}
          </Badge>
          <Badge variant="outline">
            {effectiveMethodLabels[application.applicationMethod]}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar size={12} /> {formatDate(application.applicationDate)}
          </span>
          {application.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} /> {application.location}
            </span>
          ) : null}
          <span>{effectiveWorkModeLabels[application.workMode]}</span>
          {salary ? <span>· {salary}</span> : null}
        </div>

        {application.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {application.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="text-right text-xs text-muted-foreground">
        {application.lastActivityAt ? (
          <p>Last activity {formatRelative(application.lastActivityAt)}</p>
        ) : (
          <p>Applied {formatRelative(application.createdAt)}</p>
        )}
        {application.firstResponseAt ? (
          <p className="mt-0.5 text-info">
            Response {formatRelative(application.firstResponseAt)}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
