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
import {
  DEFAULT_RESUME_VERSION_OPTIONS,
  DEFAULT_ROLE_TITLE_OPTIONS,
} from '@/lib/form-defaults';
import { buildOrderedSelectOptions, mergeLabelRecord } from '@/lib/form-select-options';
import type { AppearanceMode, ThemePresetId } from '@/lib/theme-presets';
import {
  ApplicationMethod,
  EmploymentType,
  PositionType,
  SearchPlatform,
  WorkMode,
} from '@/types/enums';
import {
  employmentLabels,
  methodLabels,
  positionLabels,
  searchPlatformLabels,
  workModeLabels,
} from '@/types/labels';
import type { PlatformFormConfig, PlatformSettingsDto } from '@/types/platform-settings';

const PLATFORM_SETTINGS_KEY = ['platform-settings'] as const;

type SelectOpt = { value: string; label: string };

type Ctx = {
  settings: PlatformSettingsDto | undefined;
  isLoading: boolean;
  effectiveMethodLabels: Record<string, string>;
  effectiveWorkModeLabels: Record<string, string>;
  effectivePositionLabels: Record<string, string>;
  effectiveEmploymentLabels: Record<string, string>;
  effectiveSearchPlatformLabels: Record<string, string>;
  methodSelectOptions: SelectOpt[];
  workModeSelectOptions: SelectOpt[];
  positionSelectOptions: SelectOpt[];
  employmentSelectOptions: SelectOpt[];
  searchPlatformSelectOptions: SelectOpt[];
  roleTitleOptions: string[];
  resumeVersionOptions: string[];
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

  const effectiveMethodLabels = useMemo(() => {
    const base: Record<string, string> = { ...methodLabels };
    return mergeLabelRecord(base, formConfig?.applicationMethodLabels);
  }, [formConfig?.applicationMethodLabels]);

  const effectiveWorkModeLabels = useMemo(() => {
    const base: Record<string, string> = { ...workModeLabels };
    return mergeLabelRecord(base, formConfig?.workModeLabels);
  }, [formConfig?.workModeLabels]);

  const effectivePositionLabels = useMemo(() => {
    const base: Record<string, string> = { ...positionLabels };
    return mergeLabelRecord(base, formConfig?.positionLabels);
  }, [formConfig?.positionLabels]);

  const effectiveEmploymentLabels = useMemo(() => {
    const base: Record<string, string> = { ...employmentLabels };
    return mergeLabelRecord(base, formConfig?.employmentLabels);
  }, [formConfig?.employmentLabels]);

  const effectiveSearchPlatformLabels = useMemo(() => {
    const base: Record<string, string> = { ...searchPlatformLabels };
    return mergeLabelRecord(base, formConfig?.searchPlatformLabels);
  }, [formConfig?.searchPlatformLabels]);

  const methodSelectOptions = useMemo(
    () =>
      buildOrderedSelectOptions(
        Object.values(ApplicationMethod),
        formConfig?.customApplicationMethods,
        effectiveMethodLabels,
        formConfig?.applicationMethodOrder,
        formConfig?.applicationMethodHidden,
      ),
    [
      effectiveMethodLabels,
      formConfig?.applicationMethodOrder,
      formConfig?.applicationMethodHidden,
      formConfig?.customApplicationMethods,
    ],
  );

  const workModeSelectOptions = useMemo(
    () =>
      buildOrderedSelectOptions(
        Object.values(WorkMode),
        [],
        effectiveWorkModeLabels,
        undefined,
        undefined,
      ),
    [effectiveWorkModeLabels],
  );

  const positionSelectOptions = useMemo(
    () =>
      buildOrderedSelectOptions(
        Object.values(PositionType),
        formConfig?.customPositionTypes,
        effectivePositionLabels,
        formConfig?.positionOrder,
        formConfig?.positionHidden,
      ),
    [
      effectivePositionLabels,
      formConfig?.positionOrder,
      formConfig?.positionHidden,
      formConfig?.customPositionTypes,
    ],
  );

  const employmentSelectOptions = useMemo(
    () =>
      buildOrderedSelectOptions(
        Object.values(EmploymentType),
        formConfig?.customEmploymentTypes,
        effectiveEmploymentLabels,
        formConfig?.employmentOrder,
        formConfig?.employmentHidden,
      ),
    [
      effectiveEmploymentLabels,
      formConfig?.employmentOrder,
      formConfig?.employmentHidden,
      formConfig?.customEmploymentTypes,
    ],
  );

  const searchPlatformSelectOptions = useMemo(
    () =>
      buildOrderedSelectOptions(
        Object.values(SearchPlatform),
        formConfig?.customSearchPlatforms,
        effectiveSearchPlatformLabels,
        formConfig?.searchPlatformOrder,
        formConfig?.searchPlatformHidden,
      ),
    [
      effectiveSearchPlatformLabels,
      formConfig?.searchPlatformOrder,
      formConfig?.searchPlatformHidden,
      formConfig?.customSearchPlatforms,
    ],
  );

  const roleTitleOptions = useMemo(
    () =>
      formConfig?.roleTitleOptions?.length
        ? [...formConfig.roleTitleOptions]
        : [...DEFAULT_ROLE_TITLE_OPTIONS],
    [formConfig?.roleTitleOptions],
  );

  const resumeVersionOptions = useMemo(
    () =>
      formConfig?.resumeVersionOptions?.length
        ? [...formConfig.resumeVersionOptions]
        : [...DEFAULT_RESUME_VERSION_OPTIONS],
    [formConfig?.resumeVersionOptions],
  );

  useEffect(() => {
    if (!data?.themeId) return;
    const appearance = (data.appearanceMode ?? 'dark') as AppearanceMode;
    applyDocumentTheme(data.themeId as ThemePresetId, appearance);
  }, [data?.themeId, data?.appearanceMode]);

  const mutation = useMutation({
    mutationFn: platformSettingsApi.update,
    onSuccess: (next) => {
      queryClient.setQueryData(PLATFORM_SETTINGS_KEY, next);
      applyDocumentTheme(
        next.themeId as ThemePresetId,
        (next.appearanceMode ?? 'dark') as AppearanceMode,
      );
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
      effectivePositionLabels,
      effectiveEmploymentLabels,
      effectiveSearchPlatformLabels,
      methodSelectOptions,
      workModeSelectOptions,
      positionSelectOptions,
      employmentSelectOptions,
      searchPlatformSelectOptions,
      roleTitleOptions,
      resumeVersionOptions,
      updateSettings,
      isUpdating: mutation.isPending,
    }),
    [
      data,
      isLoading,
      effectiveMethodLabels,
      effectiveWorkModeLabels,
      effectivePositionLabels,
      effectiveEmploymentLabels,
      effectiveSearchPlatformLabels,
      methodSelectOptions,
      workModeSelectOptions,
      positionSelectOptions,
      employmentSelectOptions,
      searchPlatformSelectOptions,
      roleTitleOptions,
      resumeVersionOptions,
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
