import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Building2,
  Calendar,
  Edit3,
  ExternalLink,
  Heart,
  MapPin,
  RotateCcw,
  Trash2,
  Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { PageLoader } from '@/components/ui/spinner';
import { ApplicationForm } from '@/components/applications/application-form';
import { StatusChanger } from '@/components/applications/status-changer';
import { Timeline } from '@/components/applications/timeline';
import { StatusBadge } from '@/components/status/status-badge';
import {
  useApplication,
  useArchiveApplication,
  useDeleteApplication,
  useRestoreApplication,
  useUpdateApplication,
} from '@/hooks/use-applications';
import {
  formatDate,
  formatDateTime,
  formatRelative,
  formatSalaryRange,
} from '@/lib/format';
import {
  employmentLabels,
  methodLabels,
  positionLabels,
  priorityLabels,
  stageLabels,
  workModeLabels,
} from '@/types/labels';

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: application, isLoading } = useApplication(id);
  const updateMutation = useUpdateApplication(id ?? '');
  const archiveMutation = useArchiveApplication();
  const restoreMutation = useRestoreApplication();
  const deleteMutation = useDeleteApplication();
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading || !application) return <PageLoader />;

  const salary = formatSalaryRange(
    application.salaryMin,
    application.salaryMax,
    application.currency,
    application.salaryPeriod,
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/applications"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Edit3 size={14} /> Edit
          </Button>
          {application.archivedAt ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => restoreMutation.mutate(application.id)}
            >
              <RotateCcw size={14} /> Restore
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => archiveMutation.mutate(application.id)}
            >
              <Archive size={14} /> Archive
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (!confirm('Delete permanently?')) return;
              deleteMutation.mutate(application.id, {
                onSuccess: () => {
                  toast.success('Application deleted');
                  navigate('/applications');
                },
              });
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <header className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {application.roleTitle}
          </h1>
          <StatusBadge status={application.status} />
          <Badge variant="outline">{stageLabels[application.stage]}</Badge>
          {application.archivedAt ? (
            <Badge variant="secondary">Archived</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Building2 size={14} /> {application.companyName}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar size={14} /> {formatDate(application.applicationDate)}
          </span>
          {application.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} /> {application.location}
            </span>
          ) : null}
          <span>{workModeLabels[application.workMode]}</span>
          <span>· {methodLabels[application.applicationMethod]}</span>
          {application.jobUrl ? (
            <a
              href={application.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              View posting <ExternalLink size={12} />
            </a>
          ) : null}
          {application.companyUrl ? (
            <a
              href={application.companyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Company <ExternalLink size={12} />
            </a>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <StatusChanger
            applicationId={application.id}
            currentStatus={application.status}
            currentStage={application.stage}
          />
          <Timeline applicationId={application.id} />

          {application.jobDescription ? (
            <Card>
              <CardHeader>
                <CardTitle>Job description</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
                  {application.jobDescription}
                </pre>
              </CardContent>
            </Card>
          ) : null}

          {application.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {application.notes}
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow size={16} /> Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Position" value={positionLabels[application.position]} />
              <Row
                label="Priority"
                value={priorityLabels[application.priority]}
              />
              {application.excitement !== null ? (
                <Row
                  label="Excitement"
                  value={
                    <span className="inline-flex items-center gap-0.5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Heart
                          key={i}
                          size={12}
                          className={
                            i < (application.excitement ?? 0)
                              ? 'fill-destructive text-destructive'
                              : 'text-muted-foreground/40'
                          }
                        />
                      ))}
                    </span>
                  }
                />
              ) : null}
              {application.employmentType ? (
                <Row
                  label="Employment"
                  value={employmentLabels[application.employmentType]}
                />
              ) : null}
              {salary ? <Row label="Salary" value={salary} /> : null}
              {application.platform ? (
                <Row label="Platform" value={application.platform} />
              ) : null}
              {application.source ? (
                <Row label="Source" value={application.source} />
              ) : null}
              {application.resumeVersion ? (
                <Row label="Resume" value={application.resumeVersion} />
              ) : null}
              {application.firstResponseAt ? (
                <Row
                  label="1st response"
                  value={formatDateTime(application.firstResponseAt)}
                />
              ) : null}
              {application.lastActivityAt ? (
                <Row
                  label="Last activity"
                  value={formatRelative(application.lastActivityAt)}
                />
              ) : null}
              {application.tags.length > 0 ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Tags
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {application.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit application"
        size="lg"
      >
        <ApplicationForm
          defaultValues={application}
          submitting={updateMutation.isPending}
          submitLabel="Save changes"
          onCancel={() => setEditOpen(false)}
          onSubmit={async (input) => {
            await updateMutation.mutateAsync(input);
            setEditOpen(false);
          }}
        />
      </Modal>
    </>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-right">{value}</span>
    </div>
  );
}
