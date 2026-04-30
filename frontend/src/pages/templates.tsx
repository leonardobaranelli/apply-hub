import { useMemo, useState } from 'react';
import {
  Copy,
  Edit,
  FileText,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
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
import {
  useCreateTemplate,
  useDeleteTemplate,
  useMarkTemplateUsed,
  useTemplatesList,
  useToggleTemplateFavorite,
  useUpdateTemplate,
} from '@/hooks/use-templates';
import { cn } from '@/lib/cn';
import { TemplateType } from '@/types/enums';
import { templateLabels } from '@/types/labels';
import type { Template } from '@/types/models';
import type { CreateTemplateInput } from '@/api/templates';

const typeOptions = [
  { value: '', label: 'All types' },
  ...Object.values(TemplateType).map((v) => ({
    value: v,
    label: templateLabels[v],
  })),
];

type LanguageFilter = 'all' | 'en' | 'es';

const LANGUAGE_TABS: ReadonlyArray<{ value: LanguageFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
];

export function TemplatesPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TemplateType | ''>('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [language, setLanguage] = useState<LanguageFilter>('all');
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);

  const params = useMemo(
    () => ({
      search: search || undefined,
      type: type || undefined,
      favoritesOnly: favoritesOnly || undefined,
      language: language === 'all' ? undefined : language,
      limit: 100,
    }),
    [search, type, favoritesOnly, language],
  );
  const { data, isLoading } = useTemplatesList(params);

  return (
    <>
      <PageHeader
        title="Templates"
        description="Cover letters, emails and messages ready to copy and paste."
        actions={
          <Button onClick={() => setOpenCreate(true)}>
            <Plus size={16} /> New template
          </Button>
        }
      />

      <div
        className="mb-3 inline-flex rounded-lg border border-border bg-card p-1"
        role="tablist"
        aria-label="Filter by language"
      >
        {LANGUAGE_TABS.map((tab) => {
          const active = language === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setLanguage(tab.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center">
        <Input
          placeholder="Search by name, subject or content..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as TemplateType | '')}
          options={typeOptions}
          className="md:w-56"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(e) => setFavoritesOnly(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          Favorites only
        </label>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No templates yet"
          description="Create your first cover letter, email or LinkedIn message to reuse."
          action={
            <Button onClick={() => setOpenCreate(true)}>
              <Plus size={16} /> New template
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.data.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => setEditing(template)}
            />
          ))}
        </div>
      )}

      <TemplateFormModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="New template"
      />

      {editing ? (
        <TemplateFormModal
          key={editing.id}
          open={true}
          onClose={() => setEditing(null)}
          title="Edit template"
          template={editing}
        />
      ) : null}
    </>
  );
}

function TemplateCard({
  template,
  onEdit,
}: {
  template: Template;
  onEdit: () => void;
}) {
  const toggleFav = useToggleTemplateFavorite();
  const markUsed = useMarkTemplateUsed();
  const remove = useDeleteTemplate();

  const handleCopy = async (): Promise<void> => {
    const text = template.subject
      ? `${template.subject}\n\n${template.body}`
      : template.body;
    await navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
    markUsed.mutate(template.id);
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle>{template.name}</CardTitle>
            {template.isFavorite ? (
              <Star
                size={14}
                className="fill-warning text-warning"
                aria-label="Favorite"
              />
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="secondary">{templateLabels[template.type]}</Badge>
            {template.tags.map((t) => (
              <Badge key={t} variant="outline">
                #{t}
              </Badge>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggleFav.mutate(template.id)}
          className="text-muted-foreground hover:text-warning"
          aria-label="Favorite"
        >
          <Star
            size={16}
            className={template.isFavorite ? 'fill-warning text-warning' : ''}
          />
        </button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {template.subject ? (
          <p className="text-sm font-medium">Subject: {template.subject}</p>
        ) : null}
        <pre className="line-clamp-6 max-h-40 overflow-hidden whitespace-pre-wrap font-sans text-sm text-muted-foreground">
          {template.body}
        </pre>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
          <span>
            Used {template.usageCount} {template.usageCount === 1 ? 'time' : 'times'}
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={handleCopy}>
              <Copy size={14} /> Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Edit size={14} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm('Delete template?')) remove.mutate(template.id);
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateFormModal({
  open,
  onClose,
  title,
  template,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  template?: Template;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [type, setType] = useState<TemplateType>(
    template?.type ?? TemplateType.EMAIL,
  );
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [tags, setTags] = useState(template?.tags.join(', ') ?? '');
  const [language, setLanguage] = useState(template?.language ?? 'en');

  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate(template?.id ?? '');

  const handleSubmit = async (): Promise<void> => {
    const payload: CreateTemplateInput = {
      name,
      type,
      subject: subject || undefined,
      body,
      tags: tags
        ? tags.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined,
      language: language || undefined,
    };
    if (template) {
      await updateMutation.mutateAsync(payload);
    } else {
      await createMutation.mutateAsync(payload);
    }
    onClose();
  };

  const submitting = createMutation.isPending || updateMutation.isPending;

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
            <Label className="mb-1 block">Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Backend Sr. cover letter"
            />
          </div>
          <div>
            <Label className="mb-1 block">Type *</Label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as TemplateType)}
              options={Object.values(TemplateType).map((v) => ({
                value: v,
                label: templateLabels[v],
              }))}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1 block">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Application for {{role}} at {{company}}"
            />
          </div>
          <div>
            <Label className="mb-1 block">Language</Label>
            <Input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="en / es"
            />
          </div>
          <div>
            <Label className="mb-1 block">Tags (comma separated)</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="cover_letter, backend"
            />
          </div>
        </div>
        <div>
          <Label className="mb-1 block">Body *</Label>
          <Textarea
            rows={12}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Hi {{recruiter_name}},\n\n...`}
            className="font-mono"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Tip: use variables like{' '}
            <code className="rounded bg-secondary px-1">
              {'{{company}}'}
            </code>
            ,{' '}
            <code className="rounded bg-secondary px-1">{'{{role}}'}</code>{' '}
            to replace them when copying.
          </p>
        </div>
      </div>
    </Modal>
  );
}
