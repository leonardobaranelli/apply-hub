import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { todayIso } from '@/lib/format';
import {
  ApplicationMethod,
  EmploymentType,
  PositionType,
  Priority,
  WorkMode,
} from '@/types/enums';
import {
  employmentLabels,
  methodLabels,
  positionLabels,
  priorityLabels,
  workModeLabels,
} from '@/types/labels';
import type { JobApplication } from '@/types/models';
import type {
  CreateApplicationInput,
  UpdateApplicationInput,
} from '@/api/applications';

const schema = z.object({
  companyName: z.string().trim().min(1, 'Company is required'),
  companyUrl: z.string().trim().url('Invalid URL').optional().or(z.literal('')),
  roleTitle: z.string().trim().min(1, 'Role is required'),
  position: z.nativeEnum(PositionType),
  applicationDate: z.string().min(1, 'Date is required'),
  applicationMethod: z.nativeEnum(ApplicationMethod),
  workMode: z.nativeEnum(WorkMode),
  employmentType: z.nativeEnum(EmploymentType).optional().or(z.literal('')),
  jobUrl: z.string().trim().url('Invalid URL').optional().or(z.literal('')),
  location: z.string().optional(),
  source: z.string().optional(),
  platform: z.string().optional(),
  salaryMin: z.coerce.number().min(0).optional().or(z.literal('')),
  salaryMax: z.coerce.number().min(0).optional().or(z.literal('')),
  currency: z.string().optional(),
  salaryPeriod: z.string().optional(),
  priority: z.nativeEnum(Priority),
  excitement: z.coerce.number().min(1).max(5).optional().or(z.literal('')),
  notes: z.string().optional(),
  tags: z.string().optional(),
  jobDescription: z.string().optional(),
  resumeVersion: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

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

export function ApplicationForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
  submitLabel = 'Save',
}: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      companyName: defaultValues?.companyName ?? '',
      companyUrl: defaultValues?.companyUrl ?? '',
      roleTitle: defaultValues?.roleTitle ?? '',
      position: defaultValues?.position ?? PositionType.BACKEND,
      applicationDate: defaultValues?.applicationDate ?? todayIso(),
      applicationMethod:
        defaultValues?.applicationMethod ?? ApplicationMethod.LINKEDIN_EASY_APPLY,
      workMode: defaultValues?.workMode ?? WorkMode.UNKNOWN,
      employmentType: defaultValues?.employmentType ?? '',
      jobUrl: defaultValues?.jobUrl ?? '',
      location: defaultValues?.location ?? '',
      source: defaultValues?.source ?? '',
      platform: defaultValues?.platform ?? '',
      salaryMin: defaultValues?.salaryMin
        ? parseFloat(defaultValues.salaryMin)
        : '',
      salaryMax: defaultValues?.salaryMax
        ? parseFloat(defaultValues.salaryMax)
        : '',
      currency: defaultValues?.currency ?? '',
      salaryPeriod: defaultValues?.salaryPeriod ?? '',
      priority: defaultValues?.priority ?? Priority.MEDIUM,
      excitement: defaultValues?.excitement ?? '',
      notes: defaultValues?.notes ?? '',
      tags: defaultValues?.tags?.join(', ') ?? '',
      jobDescription: defaultValues?.jobDescription ?? '',
      resumeVersion: defaultValues?.resumeVersion ?? '',
    },
  });

  const positionOptions = useMemo(
    () => enumToOptions(PositionType, positionLabels),
    [],
  );
  const methodOptions = useMemo(
    () => enumToOptions(ApplicationMethod, methodLabels),
    [],
  );
  const workModeOptions = useMemo(
    () => enumToOptions(WorkMode, workModeLabels),
    [],
  );
  const priorityOptions = useMemo(
    () => enumToOptions(Priority, priorityLabels),
    [],
  );
  const employmentOptions = useMemo(
    () => [
      { value: '', label: 'Unspecified' },
      ...enumToOptions(EmploymentType, employmentLabels),
    ],
    [],
  );

  const submit = async (values: FormValues): Promise<void> => {
    const tags = values.tags
      ? values.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;
    const payload: CreateApplicationInput = {
      companyName: values.companyName,
      companyUrl: values.companyUrl || null,
      roleTitle: values.roleTitle,
      position: values.position,
      applicationDate: values.applicationDate,
      applicationMethod: values.applicationMethod,
      workMode: values.workMode,
      employmentType: values.employmentType
        ? (values.employmentType as EmploymentType)
        : null,
      jobUrl: values.jobUrl || null,
      location: values.location || null,
      source: values.source || null,
      platform: values.platform || null,
      salaryMin:
        typeof values.salaryMin === 'number' ? values.salaryMin : null,
      salaryMax:
        typeof values.salaryMax === 'number' ? values.salaryMax : null,
      currency: values.currency || null,
      salaryPeriod: values.salaryPeriod || null,
      priority: values.priority,
      excitement:
        typeof values.excitement === 'number' ? values.excitement : null,
      notes: values.notes || null,
      tags,
      jobDescription: values.jobDescription || null,
      resumeVersion: values.resumeVersion || null,
    };
    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Company *" error={errors.companyName?.message}>
          <Input
            {...register('companyName')}
            placeholder="e.g. Acme Corp"
          />
        </Field>
        <Field label="Role *" error={errors.roleTitle?.message}>
          <Input
            {...register('roleTitle')}
            placeholder="e.g. Senior Backend Engineer"
          />
        </Field>
        <Field label="Position type *">
          <Select {...register('position')} options={positionOptions} />
        </Field>
        <Field label="Application date *" error={errors.applicationDate?.message}>
          <Input type="date" {...register('applicationDate')} />
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
          <Input
            {...register('location')}
            placeholder="e.g. Buenos Aires / Remote LATAM"
          />
        </Field>
        <Field label="Excitement (1-5)">
          <Input type="number" min={1} max={5} {...register('excitement')} />
        </Field>
        <Field label="Job URL" error={errors.jobUrl?.message}>
          <Input {...register('jobUrl')} placeholder="https://..." />
        </Field>
        <Field label="Company URL" error={errors.companyUrl?.message}>
          <Input {...register('companyUrl')} placeholder="https://..." />
        </Field>
        <Field label="Platform / Source">
          <Input
            {...register('platform')}
            placeholder="LinkedIn / Wellfound / etc"
          />
        </Field>
        <Field label="Source detail">
          <Input
            {...register('source')}
            placeholder="e.g. CTO post on LinkedIn"
          />
        </Field>
        <Field label="Resume used">
          <Input
            {...register('resumeVersion')}
            placeholder="e.g. v2025-02-backend-stack"
          />
        </Field>
        <Field label="Salary min">
          <Input
            type="number"
            step="0.01"
            {...register('salaryMin')}
            placeholder="3000"
          />
        </Field>
        <Field label="Salary max">
          <Input
            type="number"
            step="0.01"
            {...register('salaryMax')}
            placeholder="5000"
          />
        </Field>
        <Field label="Currency">
          <Input {...register('currency')} placeholder="USD / ARS / EUR" />
        </Field>
        <Field label="Period">
          <Input {...register('salaryPeriod')} placeholder="month / year" />
        </Field>
        <Field label="Tags (comma separated)" className="md:col-span-2">
          <Input
            {...register('tags')}
            placeholder="e.g. dream-job, remote-friendly, gpt"
          />
        </Field>
      </div>

      <Field label="Job description">
        <Textarea
          rows={4}
          {...register('jobDescription')}
          placeholder="Paste the job description..."
        />
      </Field>

      <Field label="Notes">
        <Textarea
          rows={3}
          {...register('notes')}
          placeholder="Details, contacts, what caught your eye..."
        />
      </Field>

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
