import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Edit, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { PageLoader } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/layout/page-header';
import { usePlatformSettings } from '@/context/platform-settings-context';
import { searchSessionKeys, useDeleteSearchSession, useSearchSessionsList } from '@/hooks/use-search-sessions';
import { formatDate, formatDateTime } from '@/lib/format';
import { SearchPlatform } from '@/types/enums';
import { searchCompletionLabels } from '@/types/labels';
import type { JobSearchSession } from '@/types/models';
import type { CreateSearchSessionInput } from '@/api/search-sessions';
import { searchSessionsApi } from '@/api/search-sessions';

function datetimeLocalNow(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm");
}

function dateInputToday(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function platformLabel(
  s: Pick<JobSearchSession, 'platform' | 'platformOther'>,
  labels: Record<string, string>,
): string {
  if (s.platform === SearchPlatform.OTHER && s.platformOther?.trim()) {
    const base = labels.other ?? 'Other';
    return `${base} (${s.platformOther.trim()})`;
  }
  return labels[s.platform] ?? s.platform;
}

export function SearchSessionsPage() {
  const { searchPlatformSelectOptions, effectiveSearchPlatformLabels } =
    usePlatformSettings();
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<JobSearchSession | null>(null);

  const listParams = useMemo(
    () => ({
      search: search || undefined,
      platform: platform || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit: 100,
    }),
    [search, platform, fromDate, toDate],
  );

  const { data, isLoading } = useSearchSessionsList(listParams);

  const platformOptions = [
    { value: '', label: 'All platforms' },
    ...searchPlatformSelectOptions.map((o) => ({
      value: o.value,
      label: o.label,
    })),
  ];

  return (
    <>
      <PageHeader
        title="Search sessions"
        description="Log each job search (query, filters, date window, platform) so you can reproduce it and link applications."
        actions={
          <Button onClick={() => setOpenCreate(true)}>
            <Plus size={16} /> Log search
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-card p-4 md:flex-row md:flex-wrap md:items-end">
        <div className="flex flex-1 flex-col gap-1 md:min-w-[200px]">
          <Label htmlFor="sess-search">Search</Label>
          <Input
            id="sess-search"
            placeholder="Query, filters, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 md:w-48">
          <Label>Platform</Label>
          <Select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            options={platformOptions}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="sess-from">From</Label>
          <Input
            id="sess-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="sess-to">To</Label>
          <Input
            id="sess-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSearch('');
            setPlatform('');
            setFromDate('');
            setToDate('');
          }}
        >
          Clear filters
        </Button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No search sessions"
          description="When you run LinkedIn, Google or any board search, log the query and filters here."
          action={
            <Button onClick={() => setOpenCreate(true)}>
              <Plus size={16} /> Log search
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.data.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              platformLabels={effectiveSearchPlatformLabels}
              onEdit={() => setEditing(session)}
            />
          ))}
        </div>
      )}

      <SessionFormModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Log search session"
        searchPlatformSelectOptions={searchPlatformSelectOptions}
      />

      {editing ? (
        <SessionFormModal
          key={editing.id}
          open={true}
          onClose={() => setEditing(null)}
          title="Edit search session"
          session={editing}
          searchPlatformSelectOptions={searchPlatformSelectOptions}
        />
      ) : null}
    </>
  );
}

function SessionCard({
  session,
  platformLabels,
  onEdit,
}: {
  session: JobSearchSession;
  platformLabels: Record<string, string>;
  onEdit: () => void;
}) {
  const remove = useDeleteSearchSession();

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base leading-snug">
            {session.queryTitle}
          </CardTitle>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="secondary">{platformLabel(session, platformLabels)}</Badge>
            <Badge variant="outline">
              {searchCompletionLabels[session.isComplete ? 'complete' : 'active']}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Edit size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              if (confirm('Delete this search session? Linked applications will be unlinked.')) {
                remove.mutate(session.id);
              }
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 text-sm text-muted-foreground">
        <p>
          <span className="text-foreground">When:</span>{' '}
          {formatDateTime(session.searchedAt)}
        </p>
        <p>
          <span className="text-foreground">Job posted from:</span>{' '}
          {formatDate(session.jobPostedFrom)}
        </p>
        {session.filterDescription ? (
          <p className="line-clamp-3 whitespace-pre-wrap">{session.filterDescription}</p>
        ) : null}
        {session.resultsApproxCount != null ? (
          <p>~{session.resultsApproxCount} results (approx.)</p>
        ) : null}
        {session.searchUrl ? (
          <a
            href={session.searchUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Open saved URL
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SessionFormModal({
  open,
  onClose,
  title,
  session,
  searchPlatformSelectOptions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  session?: JobSearchSession;
  searchPlatformSelectOptions: Array<{ value: string; label: string }>;
}) {
  const defaultPlatform =
    searchPlatformSelectOptions.some((o) => o.value === SearchPlatform.LINKEDIN)
      ? SearchPlatform.LINKEDIN
      : (searchPlatformSelectOptions[0]?.value ?? SearchPlatform.LINKEDIN);

  const [platform, setPlatform] = useState<string>(defaultPlatform);
  const [platformOther, setPlatformOther] = useState('');
  const [queryTitle, setQueryTitle] = useState('');
  const [filterDescription, setFilterDescription] = useState('');
  const [jobPostedFromLocal, setJobPostedFromLocal] = useState('');
  const [searchedAtLocal, setSearchedAtLocal] = useState('');
  const [resultsApprox, setResultsApprox] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [searchUrl, setSearchUrl] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    if (session) {
      setPlatform(session.platform);
      setPlatformOther(session.platformOther ?? '');
      setQueryTitle(session.queryTitle);
      setFilterDescription(session.filterDescription ?? '');
      setJobPostedFromLocal(format(parseISO(session.jobPostedFrom), 'yyyy-MM-dd'));
      setSearchedAtLocal(
        format(parseISO(session.searchedAt), "yyyy-MM-dd'T'HH:mm"),
      );
      setResultsApprox(
        session.resultsApproxCount != null ? String(session.resultsApproxCount) : '',
      );
      setIsComplete(session.isComplete);
      setSearchUrl(session.searchUrl ?? '');
      setNotes(session.notes ?? '');
    } else {
      setPlatform(defaultPlatform);
      setPlatformOther('');
      setQueryTitle('');
      setFilterDescription('');
      setJobPostedFromLocal(dateInputToday());
      setSearchedAtLocal(datetimeLocalNow());
      setResultsApprox('');
      setIsComplete(false);
      setSearchUrl('');
      setNotes('');
    }
  }, [open, session, defaultPlatform]);

  const qc = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: async (payload: CreateSearchSessionInput) => {
      if (session) return searchSessionsApi.update(session.id, payload);
      return searchSessionsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: searchSessionKeys.all });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(session ? 'Search session updated' : 'Search session saved');
    },
  });

  const handleSubmit = async (): Promise<void> => {
    if (!queryTitle.trim()) {
      toast.error('Query / title is required');
      return;
    }
    let resultsApproxCount: number | null = null;
    if (resultsApprox.trim() !== '') {
      const n = parseInt(resultsApprox.trim(), 10);
      if (Number.isNaN(n)) {
        toast.error('Result count must be a number');
        return;
      }
      resultsApproxCount = n;
    }

    const jobPostedDay =
      jobPostedFromLocal.trim() || searchedAtLocal.slice(0, 10);

    const payload: CreateSearchSessionInput = {
      platform,
      platformOther: platform === SearchPlatform.OTHER ? platformOther || null : null,
      queryTitle: queryTitle.trim(),
      filterDescription: filterDescription.trim() || null,
      jobPostedFrom: jobPostedDay,
      searchedAt: new Date(searchedAtLocal).toISOString(),
      resultsApproxCount,
      isComplete,
      searchUrl: searchUrl.trim() || null,
      notes: notes.trim() || null,
    };

    await saveMutation.mutateAsync(payload);
    onClose();
  };

  const submitting = saveMutation.isPending;

  const platformFieldOptions = useMemo(() => {
    const base = searchPlatformSelectOptions.map((o) => ({
      value: o.value,
      label: o.label,
    }));
    const cur = session?.platform;
    if (cur && !base.some((b) => b.value === cur)) {
      return [...base, { value: cur, label: cur }];
    }
    return base;
  }, [searchPlatformSelectOptions, session?.platform]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label className="mb-1 block">Platform *</Label>
            <Select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              options={platformFieldOptions}
            />
          </div>
          {platform === SearchPlatform.OTHER ? (
            <div>
              <Label className="mb-1 block">Custom platform</Label>
              <Input
                value={platformOther}
                onChange={(e) => setPlatformOther(e.target.value)}
                placeholder="e.g. Wellfound"
              />
            </div>
          ) : null}
          <div className="md:col-span-2">
            <Label className="mb-1 block">Query / role title *</Label>
            <Input
              value={queryTitle}
              onChange={(e) => setQueryTitle(e.target.value)}
              placeholder='e.g. "Node.js Developer"'
            />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1 block">Filters & notes (free text)</Label>
            <Textarea
              rows={3}
              value={filterDescription}
              onChange={(e) => setFilterDescription(e.target.value)}
              placeholder="Past 3 days, remote, easy apply, sort by latest..."
            />
          </div>
          <div>
            <Label className="mb-1 block">Job posted from (date only)</Label>
            <Input
              type="date"
              value={jobPostedFromLocal}
              onChange={(e) => setJobPostedFromLocal(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. If empty, uses the same calendar day as “Searched at”.
            </p>
          </div>
          <div>
            <Label className="mb-1 block">Searched at (local)</Label>
            <Input
              type="datetime-local"
              value={searchedAtLocal}
              onChange={(e) => setSearchedAtLocal(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1 block">Approx. result count</Label>
            <Input
              type="number"
              min={0}
              value={resultsApprox}
              onChange={(e) => setResultsApprox(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isComplete}
                onChange={(e) => setIsComplete(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Mark search as complete (still active if unchecked)
            </label>
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1 block">Saved search URL</Label>
            <Input
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1 block">Session notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
