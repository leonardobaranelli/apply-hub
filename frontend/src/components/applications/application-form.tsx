import { useEffect, useMemo, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldErrors } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePlatformSettings } from '@/context/platform-settings-context';
import {
  DEFAULT_RESUME_VERSION,
  DEFAULT_ROLE_TITLE,
} from '@/lib/form-defaults';
import { useSearchSessionsList } from '@/hooks/use-search-sessions';
import { todayIso, formatDate } from '@/lib/format';
import {
  ApplicationMethod,
  EmploymentType,
  JobPostingLanguage,
  PositionType,
  Priority,
  WorkMode,
} from '@/types/enums';
import { postingLanguageLabels, priorityLabels } from '@/types/labels';
import type { JobApplication } from '@/types/models';
import type {
  CreateApplicationInput,
  UpdateApplicationInput,
} from '@/api/applications';

const DEFAULT_SALARY_PERIOD = 'Indefinite';

function dateInputDefault(
  iso: string | undefined | null,
  fallback: string,
): string {
  if (!iso) return fallback;
  return iso.slice(0, 10);
}

const PLACEHOLDER = 'Unspecified';

/**
 * Treats sentinel placeholders ("Unspecified", empty strings) as null so
 * fields with strict format validation on the backend (URLs, emails)
 * don't reject the request.
 */
const stripPlaceholder = (
  value: string | undefined | null,
): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === PLACEHOLDER) return null;
  return trimmed;
};

const schema = z.object({
  companyName: z.string().trim().min(1, 'Company is required'),
  companyUrl: z.string().optional().or(z.literal('')),
  roleTitle: z.string().min(1, 'Role is required'),
  jobTitle: z.string().trim().min(1, 'Job title is required'),
  position: z.string().min(1, 'Position type is required'),
  applicationDate: z.string().min(1, 'Date is required'),
  vacancyPostedDate: z.string().min(1, 'Date is required'),
  applicationMethod: z.string().min(1, 'Application method is required'),
  workMode: z.nativeEnum(WorkMode),
  employmentType: z.string().optional().or(z.literal('')),
  jobUrl: z.string().optional().or(z.literal('')),
  location: z.string().optional(),
  source: z.string().optional(),
  platform: z.string().optional(),
  salaryMin: z.coerce.number().min(0).optional().or(z.literal('')),
  salaryMax: z.coerce.number().min(0).optional().or(z.literal('')),
  currency: z.string().optional(),
  salaryPeriod: z.string().optional(),
  priority: z.nativeEnum(Priority),
  notes: z.string().optional(),
  tags: z.string().optional(),
  jobDescription: z.string().optional(),
  postingLanguage: z
    .enum(['', JobPostingLanguage.EN, JobPostingLanguage.ES])
    .optional(),
  resumeVersion: z.string().optional(),
  contactName: z.string().optional(),
  contactLinkedin: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  contactOther: z.string().optional(),
  jobSearchSessionId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function firstFormErrorMessage(errors: FieldErrors<FormValues>): string {
  for (const v of Object.values(errors)) {
    if (v && typeof v === 'object' && 'message' in v && v.message) {
      return String(v.message);
    }
  }
  return 'Please fix the errors in the form.';
}

interface Props {
  defaultValues?: Partial<JobApplication>;
  onSubmit: (
    input: CreateApplicationInput | UpdateApplicationInput,
  ) => Promise<unknown> | void;
  onCancel?: () => void;
  submitting?: boolean;
  submitLabel?: string;
}

const enumToOptions = <T extends Record<string, string>>(
  enumLike: T,
  labels: Record<string, string>,
): Array<{ value: string; label: string }> =>
  Object.values(enumLike).map((v) => ({
    value: v,
    label: labels[v] ?? v,
  }));

const literalToOptions = (
  values: ReadonlyArray<string>,
): Array<{ value: string; label: string }> =>
  values.map((v) => ({ value: v, label: v }));

export function ApplicationForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
  submitLabel = 'Save',
}: Props) {
  const isEdit = Boolean(defaultValues?.id);
  const {
    methodSelectOptions,
    workModeSelectOptions,
    positionSelectOptions,
    employmentSelectOptions,
    roleTitleOptions,
    resumeVersionOptions,
  } = usePlatformSettings();

  const { data: sessionsData } = useSearchSessionsList({ limit: 100 });

  const latestActiveSessionId = useMemo(() => {
    const list = sessionsData?.data ?? [];
    const actives = list
      .filter((s) => !s.isComplete)
      .sort(
        (a, b) =>
          Date.parse(b.searchedAt) - Date.parse(a.searchedAt),
      );
    return actives[0]?.id ?? '';
  }, [sessionsData]);

  const sessionSelectOptions = useMemo(
    () => [
      { value: '', label: 'None' },
      ...(sessionsData?.data ?? []).map((s) => ({
        value: s.id,
        label: `${formatDate(s.searchedAt)} · ${s.queryTitle}${!s.isComplete ? ' · Active' : ''}`,
      })),
    ],
    [sessionsData],
  );

  const appliedActiveSessionDefaultRef = useRef(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      companyName: defaultValues?.companyName ?? PLACEHOLDER,
      companyUrl: defaultValues?.companyUrl ?? (isEdit ? '' : PLACEHOLDER),
      roleTitle: defaultValues?.roleTitle ?? DEFAULT_ROLE_TITLE,
      jobTitle: defaultValues?.jobTitle ?? '',
      position: defaultValues?.position ?? PositionType.BACKEND,
      applicationDate: dateInputDefault(defaultValues?.applicationDate, todayIso()),
      vacancyPostedDate: dateInputDefault(
        defaultValues?.vacancyPostedDate ?? defaultValues?.applicationDate,
        todayIso(),
      ),
      applicationMethod:
        defaultValues?.applicationMethod ?? ApplicationMethod.LINKEDIN_EASY_APPLY,
      workMode: defaultValues?.workMode ?? WorkMode.REMOTE,
      employmentType: defaultValues?.employmentType ?? EmploymentType.FULL_TIME,
      jobUrl: defaultValues?.jobUrl ?? (isEdit ? '' : PLACEHOLDER),
      location: defaultValues?.location ?? (isEdit ? '' : 'Home'),
      source: defaultValues?.source ?? (isEdit ? '' : PLACEHOLDER),
      platform: defaultValues?.platform ?? (isEdit ? '' : 'LinkedIn'),
      salaryMin: defaultValues?.salaryMin
        ? parseFloat(defaultValues.salaryMin)
        : '',
      salaryMax: defaultValues?.salaryMax
        ? parseFloat(defaultValues.salaryMax)
        : '',
      currency: defaultValues?.currency ?? '',
      salaryPeriod:
        defaultValues?.salaryPeriod ?? (isEdit ? '' : DEFAULT_SALARY_PERIOD),
      priority: defaultValues?.priority ?? Priority.HIGH,
      notes: defaultValues?.notes ?? '',
      tags: defaultValues?.tags?.join(', ') ?? '',
      jobDescription: defaultValues?.jobDescription ?? '',
      postingLanguage: defaultValues?.postingLanguage ?? '',
      resumeVersion: defaultValues?.resumeVersion ?? DEFAULT_RESUME_VERSION,
      contactName: defaultValues?.contactName ?? (isEdit ? '' : PLACEHOLDER),
      contactLinkedin:
        defaultValues?.contactLinkedin ?? (isEdit ? '' : PLACEHOLDER),
      contactEmail: defaultValues?.contactEmail ?? (isEdit ? '' : PLACEHOLDER),
      contactPhone: defaultValues?.contactPhone ?? (isEdit ? '' : PLACEHOLDER),
      contactOther: defaultValues?.contactOther ?? (isEdit ? '' : PLACEHOLDER),
      jobSearchSessionId: defaultValues?.jobSearchSessionId ?? '',
    },
  });

  useEffect(() => {
    if (isEdit) return;
    if (defaultValues?.jobSearchSessionId) return;
    if (appliedActiveSessionDefaultRef.current) return;
    if (!latestActiveSessionId) return;
    setValue('jobSearchSessionId', latestActiveSessionId);
    appliedActiveSessionDefaultRef.current = true;
  }, [
    isEdit,
    defaultValues?.jobSearchSessionId,
    latestActiveSessionId,
    setValue,
  ]);

  const positionOptions = useMemo(
    () =>
      positionSelectOptions.map((o) => ({
        value: o.value,
        label: o.label,
      })),
    [positionSelectOptions],
  );
  const methodOptions = useMemo(
    () =>
      methodSelectOptions.map((o) => ({
        value: o.value,
        label: o.label,
      })),
    [methodSelectOptions],
  );
  const workModeOptions = useMemo(
    () =>
      workModeSelectOptions.map((o) => ({
        value: o.value,
        label: o.label,
      })),
    [workModeSelectOptions],
  );
  const priorityOptions = useMemo(
    () => enumToOptions(Priority, priorityLabels),
    [],
  );
  const employmentOptions = useMemo(
    () => [
      { value: '', label: 'Unspecified' },
      ...employmentSelectOptions.map((o) => ({
        value: o.value,
        label: o.label,
      })),
    ],
    [employmentSelectOptions],
  );
  const roleOptions = useMemo(() => {
    const base = [...roleTitleOptions];
    const current = defaultValues?.roleTitle;
    if (current && !base.includes(current)) base.unshift(current);
    return literalToOptions(base);
  }, [roleTitleOptions, defaultValues?.roleTitle]);

  const resumeOptions = useMemo(() => {
    const base = [...resumeVersionOptions];
    const current = defaultValues?.resumeVersion ?? undefined;
    if (current && !base.includes(current)) base.unshift(current);
    return literalToOptions(base);
  }, [resumeVersionOptions, defaultValues?.resumeVersion]);

  const postingLanguageOptions = useMemo(
    () => [
      { value: '', label: 'Unspecified' },
      {
        value: JobPostingLanguage.EN,
        label: postingLanguageLabels[JobPostingLanguage.EN],
      },
      {
        value: JobPostingLanguage.ES,
        label: postingLanguageLabels[JobPostingLanguage.ES],
      },
    ],
    [],
  );

  const submit = async (values: FormValues): Promise<void> => {
    const tags = values.tags
      ? values.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;

    const payload: CreateApplicationInput = {
      companyName: values.companyName.trim() || PLACEHOLDER,
      companyUrl: stripPlaceholder(values.companyUrl),
      roleTitle: values.roleTitle,
      jobTitle: values.jobTitle.trim(),
      position: values.position,
      applicationDate: values.applicationDate,
      vacancyPostedDate: values.vacancyPostedDate,
      applicationMethod: values.applicationMethod,
      workMode: values.workMode,
      employmentType: values.employmentType?.trim()
        ? values.employmentType.trim()
        : null,
      jobUrl: stripPlaceholder(values.jobUrl),
      location: stripPlaceholder(values.location),
      source: stripPlaceholder(values.source),
      platform: stripPlaceholder(values.platform),
      salaryMin:
        typeof values.salaryMin === 'number' ? values.salaryMin : null,
      salaryMax:
        typeof values.salaryMax === 'number' ? values.salaryMax : null,
      currency: stripPlaceholder(values.currency),
      salaryPeriod: stripPlaceholder(values.salaryPeriod),
      priority: values.priority,
      notes: stripPlaceholder(values.notes),
      tags,
      jobDescription: stripPlaceholder(values.jobDescription),
      postingLanguage:
        values.postingLanguage === JobPostingLanguage.EN ||
        values.postingLanguage === JobPostingLanguage.ES
          ? values.postingLanguage
          : null,
      resumeVersion: values.resumeVersion || null,
      contactName: stripPlaceholder(values.contactName),
      contactLinkedin: stripPlaceholder(values.contactLinkedin),
      contactEmail: stripPlaceholder(values.contactEmail),
      contactPhone: stripPlaceholder(values.contactPhone),
      contactOther: stripPlaceholder(values.contactOther),
    };

    if (isEdit) {
      payload.jobSearchSessionId = values.jobSearchSessionId?.trim()
        ? values.jobSearchSessionId.trim()
        : null;
    } else if (values.jobSearchSessionId?.trim()) {
      payload.jobSearchSessionId = values.jobSearchSessionId.trim();
    }

    await onSubmit(payload);
  };

  const onInvalid = (errors: FieldErrors<FormValues>): void => {
    toast.error('Form incomplete', {
      description: firstFormErrorMessage(errors),
    });
  };

  return (
    <form onSubmit={handleSubmit(submit, onInvalid)} className="space-y-6">
      {/* ── Application core ─────────────────────────────────────── */}
      <Section title="Application">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Company *" error={errors.companyName?.message}>
            <Input {...register('companyName')} />
          </Field>
          <Field label="Job title *" error={errors.jobTitle?.message}>
            <Input
              {...register('jobTitle')}
              placeholder="e.g. Backend Engineer"
            />
          </Field>
          <Field label="Role *" error={errors.roleTitle?.message}>
            <Select {...register('roleTitle')} options={roleOptions} />
          </Field>
          <Field label="Position type *">
            <Select {...register('position')} options={positionOptions} />
          </Field>
          <Field
            label="Application date *"
            error={errors.applicationDate?.message}
          >
            <Input type="date" {...register('applicationDate')} />
          </Field>
          <Field
            label="Vacancy posted *"
            error={errors.vacancyPostedDate?.message}
          >
            <Input type="date" {...register('vacancyPostedDate')} />
          </Field>
          <Field label="Job required language">
            <Select
              {...register('postingLanguage')}
              options={postingLanguageOptions}
            />
          </Field>
          <Field label="Application method *">
            <Select {...register('applicationMethod')} options={methodOptions} />
          </Field>
          <Field label="Work mode">
            <Select {...register('workMode')} options={workModeOptions} />
          </Field>
          <Field label="Employment type">
            <Select {...register('employmentType')} options={employmentOptions} />
          </Field>
          <Field label="Priority">
            <Select {...register('priority')} options={priorityOptions} />
          </Field>
          <Field label="Location">
            <Input {...register('location')} />
          </Field>
          <Field label="Resume used">
            <Select {...register('resumeVersion')} options={resumeOptions} />
          </Field>
          <Field label="Platform / Source">
            <Input {...register('platform')} placeholder="LinkedIn" />
          </Field>
          <Field label="Job search session (latest active by default)">
            <Select
              {...register('jobSearchSessionId')}
              options={sessionSelectOptions}
            />
          </Field>
          <Field label="Source detail">
            <Input {...register('source')} />
          </Field>
          <Field label="Job URL">
            <Input {...register('jobUrl')} />
          </Field>
          <Field label="Company URL">
            <Input {...register('companyUrl')} />
          </Field>
          <Field label="Salary min">
            <Input
              type="number"
              step="0.01"
              {...register('salaryMin')}
              placeholder={PLACEHOLDER}
            />
          </Field>
          <Field label="Salary max">
            <Input
              type="number"
              step="0.01"
              {...register('salaryMax')}
              placeholder={PLACEHOLDER}
            />
          </Field>
          <Field label="Currency">
            <Input
              {...register('currency')}
              placeholder="USD / ARS / EUR"
            />
          </Field>
          <Field label="Period">
            <Input {...register('salaryPeriod')} />
          </Field>
          <Field label="Tags (comma separated)" className="md:col-span-2">
            <Input
              {...register('tags')}
              placeholder="e.g. dream-job, remote-friendly, gpt"
            />
          </Field>
        </div>
      </Section>

      {/* ── Vacancy contact ──────────────────────────────────────── */}
      <Section
        title="Vacancy contact"
        description="Whoever is on the other side of this opportunity (recruiter, hiring manager, referral)."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name">
            <Input {...register('contactName')} />
          </Field>
          <Field label="LinkedIn profile">
            <Input {...register('contactLinkedin')} />
          </Field>
          <Field label="Email">
            <Input {...register('contactEmail')} />
          </Field>
          <Field label="Phone">
            <Input {...register('contactPhone')} />
          </Field>
          <Field label="Other" className="md:col-span-2">
            <Input
              {...register('contactOther')}
              placeholder="Telegram, WhatsApp, internal id..."
            />
          </Field>
        </div>
      </Section>

      {/* ── Long form content ────────────────────────────────────── */}
      <Section title="Description & notes">
        <Field label="Job description">
          <Textarea
            rows={4}
            {...register('jobDescription')}
            placeholder="Paste the job description..."
          />
        </Field>
        <Field label="Notes" className="mt-3">
          <Textarea
            rows={3}
            {...register('notes')}
            placeholder="Details, context, what caught your eye..."
          />
        </Field>
      </Section>

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

interface SectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function Section({ title, description, children }: SectionProps) {
  return (
    <section className="rounded-xl border border-border bg-card/40 p-4">
      <header className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

function Field({ label, error, className, children }: FieldProps) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
