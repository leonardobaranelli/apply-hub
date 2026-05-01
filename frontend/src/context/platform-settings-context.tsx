import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  platformSettingsApi,
  type UpdatePlatformSettingsInput,
} from '@/api/platform-settings';
import { applyDocumentTheme } from '@/lib/apply-theme';
import { buildOrderedEnumOptions, mergeLabelRecord } from '@/lib/form-select-options';
import type { ThemePresetId } from '@/lib/theme-presets';
import { ApplicationMethod, WorkMode } from '@/types/enums';
import { methodLabels, workModeLabels } from '@/types/labels';
import type { PlatformFormConfig, PlatformSettingsDto } from '@/types/platform-settings';

const PLATFORM_SETTINGS_KEY = ['platform-settings'] as const;

type Ctx = {
  settings: PlatformSettingsDto | undefined;
  isLoading: boolean;
  /** Merged labels for display (tables, detail) */
  effectiveMethodLabels: Record<ApplicationMethod, string>;
  effectiveWorkModeLabels: Record<WorkMode, string>;
  methodSelectOptions: Array<{ value: ApplicationMethod; label: string }>;
  workModeSelectOptions: Array<{ value: WorkMode; label: string }>;
  updateSettings: (input: UpdatePlatformSettingsInput) => Promise<PlatformSettingsDto>;
  isUpdating: boolean;
};

const PlatformSettingsContext = createContext<Ctx | null>(null);

export function PlatformSettingsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: PLATFORM_SETTINGS_KEY,
    queryFn: platformSettingsApi.get,
    staleTime: 30_000,
  });

  const formConfig = data?.formConfig as PlatformFormConfig | undefined;

  const effectiveMethodLabels = useMemo(
    () => mergeLabelRecord(methodLabels, formConfig?.applicationMethodLabels),
    [formConfig?.applicationMethodLabels],
  );

  const effectiveWorkModeLabels = useMemo(
    () => mergeLabelRecord(workModeLabels, formConfig?.workModeLabels),
    [formConfig?.workModeLabels],
  );

  const methodSelectOptions = useMemo(
    () =>
      buildOrderedEnumOptions(
        Object.values(ApplicationMethod),
        effectiveMethodLabels,
        formConfig?.applicationMethodOrder,
        formConfig?.applicationMethodHidden,
      ),
    [
      effectiveMethodLabels,
      formConfig?.applicationMethodOrder,
      formConfig?.applicationMethodHidden,
    ],
  );

  const workModeSelectOptions = useMemo(
    () =>
      buildOrderedEnumOptions(
        Object.values(WorkMode),
        effectiveWorkModeLabels,
        undefined,
        undefined,
      ),
    [effectiveWorkModeLabels],
  );

  useEffect(() => {
    if (data?.themeId) {
      applyDocumentTheme(data.themeId as ThemePresetId);
    }
  }, [data?.themeId]);

  const mutation = useMutation({
    mutationFn: platformSettingsApi.update,
    onSuccess: (next) => {
      queryClient.setQueryData(PLATFORM_SETTINGS_KEY, next);
      applyDocumentTheme(next.themeId as ThemePresetId);
    },
  });

  const updateSettings = useCallback(
    (input: UpdatePlatformSettingsInput) => mutation.mutateAsync(input),
    [mutation],
  );

  const value = useMemo(
    () => ({
      settings: data,
      isLoading,
      effectiveMethodLabels,
      effectiveWorkModeLabels,
      methodSelectOptions,
      workModeSelectOptions,
      updateSettings,
      isUpdating: mutation.isPending,
    }),
    [
      data,
      isLoading,
      effectiveMethodLabels,
      effectiveWorkModeLabels,
      methodSelectOptions,
      workModeSelectOptions,
      updateSettings,
      mutation.isPending,
    ],
  );

  return (
    <PlatformSettingsContext.Provider value={value}>
      {children}
    </PlatformSettingsContext.Provider>
  );
}

export function usePlatformSettings(): Ctx {
  const ctx = useContext(PlatformSettingsContext);
  if (!ctx) {
    throw new Error('usePlatformSettings must be used within PlatformSettingsProvider');
  }
  return ctx;
}
