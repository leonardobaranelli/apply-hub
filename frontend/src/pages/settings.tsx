import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout/page-header';
import { usePlatformSettings } from '@/context/platform-settings-context';
import { applyDocumentTheme, getAppliedThemeSnapshot } from '@/lib/apply-theme';
import {
  DEFAULT_RESUME_VERSION_OPTIONS,
  DEFAULT_ROLE_TITLE_OPTIONS,
} from '@/lib/form-defaults';
import {
  APPEARANCE_LABELS,
  APPEARANCE_MODES,
  THEME_PRESET_SWATCH_CLASS,
  THEME_PRESETS,
  type AppearanceMode,
  type ThemePresetId,
} from '@/lib/theme-presets';
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
import type { PlatformFormConfig } from '@/types/platform-settings';
import { cn } from '@/lib/cn';

const CUSTOM_OPTION_KEY_REGEX = /^[a-z][a-z0-9_]{0,47}$/;

const ALL_METHODS = Object.values(ApplicationMethod);
const ALL_POSITIONS = Object.values(PositionType);
const ALL_EMPLOYMENT = Object.values(EmploymentType);
const ALL_SEARCH_PLATFORMS = Object.values(SearchPlatform);
const ALL_WORK_MODES = Object.values(WorkMode);

const BUILTIN_METHOD = new Set<string>(ALL_METHODS);
const BUILTIN_POSITION = new Set<string>(ALL_POSITIONS);
const BUILTIN_EMPLOYMENT = new Set<string>(ALL_EMPLOYMENT);
const BUILTIN_SEARCH_PLATFORM = new Set<string>(ALL_SEARCH_PLATFORMS);

function normalizeOrder(
  cfg: PlatformFormConfig | undefined,
  builtinOrdered: string[],
  builtinSet: Set<string>,
  customKey: keyof PlatformFormConfig,
  orderKey: keyof PlatformFormConfig,
): string[] {
  const custom = (cfg?.[customKey] as string[] | undefined) ?? [];
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const id of builtinOrdered) {
    if (!seen.has(id)) {
      merged.push(id);
      seen.add(id);
    }
  }
  for (const id of custom) {
    if (builtinSet.has(id)) continue;
    if (!seen.has(id)) {
      merged.push(id);
      seen.add(id);
    }
  }
  const order = cfg?.[orderKey] as string[] | undefined;
  if (
    order &&
    order.length === merged.length &&
    new Set(order).size === merged.length &&
    order.every((k) => seen.has(k))
  ) {
    return [...order];
  }
  return merged;
}

function diffLabels(
  order: string[],
  labels: Record<string, string>,
  defaults: Record<string, string>,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const id of order) {
    const v = labels[id]?.trim() ?? '';
    const def = defaults[id] ?? '';
    if (v && v !== def) out[id] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function buildFormConfig(params: {
  methodOrder: string[];
  labelByMethod: Record<string, string>;
  hiddenMethods: Set<string>;
  positionOrder: string[];
  labelByPosition: Record<string, string>;
  hiddenPositions: Set<string>;
  employmentOrder: string[];
  labelByEmployment: Record<string, string>;
  hiddenEmployment: Set<string>;
  searchPlatformOrder: string[];
  labelBySearchPlatform: Record<string, string>;
  hiddenSearchPlatforms: Set<string>;
  labelByWorkMode: Record<WorkMode, string>;
  roleTitleOptions: string[];
  resumeVersionOptions: string[];
}): PlatformFormConfig {
  const {
    methodOrder,
    labelByMethod,
    hiddenMethods,
    positionOrder,
    labelByPosition,
    hiddenPositions,
    employmentOrder,
    labelByEmployment,
    hiddenEmployment,
    searchPlatformOrder,
    labelBySearchPlatform,
    hiddenSearchPlatforms,
    labelByWorkMode,
    roleTitleOptions,
    resumeVersionOptions,
  } = params;

  const applicationMethodLabels = diffLabels(
    methodOrder,
    labelByMethod,
    methodLabels as Record<string, string>,
  );
  const positionLabelsOut = diffLabels(
    positionOrder,
    labelByPosition,
    positionLabels as Record<string, string>,
  );
  const employmentLabelsOut = diffLabels(
    employmentOrder,
    labelByEmployment,
    employmentLabels as Record<string, string>,
  );
  const searchPlatformLabelsOut = diffLabels(
    searchPlatformOrder,
    labelBySearchPlatform,
    searchPlatformLabels as Record<string, string>,
  );

  const workModeLabelsOut: Record<string, string> = {};
  for (const w of ALL_WORK_MODES) {
    const v = labelByWorkMode[w]?.trim() ?? '';
    if (v && v !== workModeLabels[w]) workModeLabelsOut[w] = v;
  }

  return {
    customApplicationMethods: methodOrder.filter((id) => !BUILTIN_METHOD.has(id)),
    applicationMethodLabels,
    applicationMethodOrder: [...methodOrder],
    applicationMethodHidden: [...hiddenMethods],
    customPositionTypes: positionOrder.filter((id) => !BUILTIN_POSITION.has(id)),
    positionLabels: positionLabelsOut,
    positionOrder: [...positionOrder],
    positionHidden: [...hiddenPositions],
    customEmploymentTypes: employmentOrder.filter(
      (id) => !BUILTIN_EMPLOYMENT.has(id),
    ),
    employmentLabels: employmentLabelsOut,
    employmentOrder: [...employmentOrder],
    employmentHidden: [...hiddenEmployment],
    customSearchPlatforms: searchPlatformOrder.filter(
      (id) => !BUILTIN_SEARCH_PLATFORM.has(id),
    ),
    searchPlatformLabels: searchPlatformLabelsOut,
    searchPlatformOrder: [...searchPlatformOrder],
    searchPlatformHidden: [...hiddenSearchPlatforms],
    workModeLabels:
      Object.keys(workModeLabelsOut).length > 0 ? workModeLabelsOut : undefined,
    roleTitleOptions: (() => {
      const rows = roleTitleOptions.map((s) => s.trim()).filter(Boolean);
      return rows.length ? rows : [...DEFAULT_ROLE_TITLE_OPTIONS];
    })(),
    resumeVersionOptions: (() => {
      const rows = resumeVersionOptions.map((s) => s.trim()).filter(Boolean);
      return rows.length ? rows : [...DEFAULT_RESUME_VERSION_OPTIONS];
    })(),
  };
}

export function SettingsPage() {
  const { settings, updateSettings, isUpdating } = usePlatformSettings();

  const [appearanceDraft, setAppearanceDraft] = useState<AppearanceMode>('dark');
  const [themeDraft, setThemeDraft] = useState<ThemePresetId>('ocean');

  const [methodOrder, setMethodOrder] = useState<string[]>([...ALL_METHODS]);
  const [labelByMethod, setLabelByMethod] = useState<Record<string, string>>({
    ...methodLabels,
  });
  const [hiddenMethods, setHiddenMethods] = useState<Set<string>>(new Set());
  const [newMethodSlug, setNewMethodSlug] = useState('');
  const [methodSlugError, setMethodSlugError] = useState('');

  const [positionOrder, setPositionOrder] = useState<string[]>([
    ...ALL_POSITIONS,
  ]);
  const [labelByPosition, setLabelByPosition] = useState<Record<string, string>>(
    { ...positionLabels },
  );
  const [hiddenPositions, setHiddenPositions] = useState<Set<string>>(
    new Set(),
  );
  const [newPositionSlug, setNewPositionSlug] = useState('');
  const [positionSlugError, setPositionSlugError] = useState('');

  const [employmentOrder, setEmploymentOrder] = useState<string[]>([
    ...ALL_EMPLOYMENT,
  ]);
  const [labelByEmployment, setLabelByEmployment] = useState<
    Record<string, string>
  >({ ...employmentLabels });
  const [hiddenEmployment, setHiddenEmployment] = useState<Set<string>>(
    new Set(),
  );
  const [newEmploymentSlug, setNewEmploymentSlug] = useState('');
  const [employmentSlugError, setEmploymentSlugError] = useState('');

  const [searchPlatformOrder, setSearchPlatformOrder] = useState<string[]>([
    ...ALL_SEARCH_PLATFORMS,
  ]);
  const [labelBySearchPlatform, setLabelBySearchPlatform] = useState<
    Record<string, string>
  >({ ...searchPlatformLabels });
  const [hiddenSearchPlatforms, setHiddenSearchPlatforms] = useState<
    Set<string>
  >(new Set());
  const [newSearchPlatformSlug, setNewSearchPlatformSlug] = useState('');
  const [searchPlatformSlugError, setSearchPlatformSlugError] = useState('');

  const [labelByWorkMode, setLabelByWorkMode] = useState<Record<WorkMode, string>>(
    { ...workModeLabels },
  );

  const [roleTitleOptions, setRoleTitleOptions] = useState<string[]>([
    ...DEFAULT_ROLE_TITLE_OPTIONS,
  ]);
  const [resumeVersionOptions, setResumeVersionOptions] = useState<string[]>([
    ...DEFAULT_RESUME_VERSION_OPTIONS,
  ]);

  const hasInitializedRef = useRef(false);

  useLayoutEffect(() => {
    if (hasInitializedRef.current) return;

    const applied = getAppliedThemeSnapshot();
    setThemeDraft(applied.theme);
    setAppearanceDraft(applied.appearance);

    if (!settings) return;

    const cfg = settings.formConfig ?? {};

    setMethodOrder(
      normalizeOrder(cfg, ALL_METHODS, BUILTIN_METHOD, 'customApplicationMethods', 'applicationMethodOrder'),
    );
    const ml: Record<string, string> = { ...methodLabels };
    for (const [k, v] of Object.entries(cfg.applicationMethodLabels ?? {})) {
      if (v) ml[k] = v;
    }
    setLabelByMethod(ml);
    setHiddenMethods(new Set(cfg.applicationMethodHidden ?? []));

    setPositionOrder(
      normalizeOrder(cfg, ALL_POSITIONS, BUILTIN_POSITION, 'customPositionTypes', 'positionOrder'),
    );
    const pl: Record<string, string> = { ...positionLabels };
    for (const [k, v] of Object.entries(cfg.positionLabels ?? {})) {
      if (v) pl[k] = v;
    }
    setLabelByPosition(pl);
    setHiddenPositions(new Set(cfg.positionHidden ?? []));

    setEmploymentOrder(
      normalizeOrder(cfg, ALL_EMPLOYMENT, BUILTIN_EMPLOYMENT, 'customEmploymentTypes', 'employmentOrder'),
    );
    const el: Record<string, string> = { ...employmentLabels };
    for (const [k, v] of Object.entries(cfg.employmentLabels ?? {})) {
      if (v) el[k] = v;
    }
    setLabelByEmployment(el);
    setHiddenEmployment(new Set(cfg.employmentHidden ?? []));

    setSearchPlatformOrder(
      normalizeOrder(
        cfg,
        ALL_SEARCH_PLATFORMS,
        BUILTIN_SEARCH_PLATFORM,
        'customSearchPlatforms',
        'searchPlatformOrder',
      ),
    );
    const spl: Record<string, string> = { ...searchPlatformLabels };
    for (const [k, v] of Object.entries(cfg.searchPlatformLabels ?? {})) {
      if (v) spl[k] = v;
    }
    setLabelBySearchPlatform(spl);
    setHiddenSearchPlatforms(new Set(cfg.searchPlatformHidden ?? []));

    const wm = { ...workModeLabels };
    for (const [k, v] of Object.entries(cfg.workModeLabels ?? {})) {
      if (v && ALL_WORK_MODES.includes(k as WorkMode)) {
        wm[k as WorkMode] = v;
      }
    }
    setLabelByWorkMode(wm);

    setRoleTitleOptions(
      cfg.roleTitleOptions?.length
        ? [...cfg.roleTitleOptions]
        : [...DEFAULT_ROLE_TITLE_OPTIONS],
    );
    setResumeVersionOptions(
      cfg.resumeVersionOptions?.length
        ? [...cfg.resumeVersionOptions]
        : [...DEFAULT_RESUME_VERSION_OPTIONS],
    );

    setNewMethodSlug('');
    setMethodSlugError('');
    setNewPositionSlug('');
    setPositionSlugError('');
    setNewEmploymentSlug('');
    setEmploymentSlugError('');
    setNewSearchPlatformSlug('');
    setSearchPlatformSlugError('');

    hasInitializedRef.current = true;
  }, [settings]);

  const builtConfig = useMemo(
    () =>
      buildFormConfig({
        methodOrder,
        labelByMethod,
        hiddenMethods,
        positionOrder,
        labelByPosition,
        hiddenPositions,
        employmentOrder,
        labelByEmployment,
        hiddenEmployment,
        searchPlatformOrder,
        labelBySearchPlatform,
        hiddenSearchPlatforms,
        labelByWorkMode,
        roleTitleOptions,
        resumeVersionOptions,
      }),
    [
      methodOrder,
      labelByMethod,
      hiddenMethods,
      positionOrder,
      labelByPosition,
      hiddenPositions,
      employmentOrder,
      labelByEmployment,
      hiddenEmployment,
      searchPlatformOrder,
      labelBySearchPlatform,
      hiddenSearchPlatforms,
      labelByWorkMode,
      roleTitleOptions,
      resumeVersionOptions,
    ],
  );

  const isDirty = useMemo(() => {
    if (!settings) return false;
    if (themeDraft !== settings.themeId) return true;
    if (appearanceDraft !== (settings.appearanceMode ?? 'dark')) return true;
    return JSON.stringify(builtConfig) !== JSON.stringify(settings.formConfig ?? {});
  }, [settings, themeDraft, appearanceDraft, builtConfig]);

  const tryAddCustomSlug = (
    raw: string,
    builtinSet: Set<string>,
    order: string[],
    setOrder: Dispatch<SetStateAction<string[]>>,
    setLabels: Dispatch<SetStateAction<Record<string, string>>>,
    setError: (s: string) => void,
    defaultLabelFor: string,
  ): void => {
    const slug = raw.trim().toLowerCase();
    setError('');
    if (!slug) {
      setError('Enter a slug (lowercase, a-z, 0-9, underscore).');
      return;
    }
    if (!CUSTOM_OPTION_KEY_REGEX.test(slug)) {
      setError('Use lowercase letters, digits and underscore only (max 48 chars).');
      return;
    }
    if (builtinSet.has(slug)) {
      setError('That id is reserved for a built-in option.');
      return;
    }
    if (order.includes(slug)) {
      setError('That option is already in the list.');
      return;
    }
    setOrder((prev) => [...prev, slug]);
    setLabels((prev) => ({ ...prev, [slug]: defaultLabelFor || slug }));
  };

  const removeCustomFromOrder = (
    id: string,
    builtinSet: Set<string>,
    setOrder: Dispatch<SetStateAction<string[]>>,
    setHidden: Dispatch<SetStateAction<Set<string>>>,
    setLabels: Dispatch<SetStateAction<Record<string, string>>>,
  ): void => {
    if (builtinSet.has(id)) return;
    setOrder((prev) => prev.filter((k) => k !== id));
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setLabels((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<number | null>(null);

  const persistDraft = useCallback(
    async (showToast: boolean): Promise<void> => {
      if (!settings) return;
      try {
        await updateSettings({
          themeId: themeDraft,
          appearanceMode: appearanceDraft,
          formConfig: builtConfig,
        });
        setLastAutoSavedAt(Date.now());
        if (showToast) toast.success('Settings saved');
      } catch {
        /* api interceptor */
      }
    },
    [settings, themeDraft, appearanceDraft, builtConfig, updateSettings],
  );

  const handleSave = useCallback(
    () => persistDraft(true),
    [persistDraft],
  );

  useEffect(() => {
    if (!hasInitializedRef.current) return;
    if (!settings || !isDirty || isUpdating) return;
    const t = window.setTimeout(() => {
      void persistDraft(false);
    }, 700);
    return () => window.clearTimeout(t);
  }, [isDirty, isUpdating, settings, persistDraft]);

  const selectTheme = (id: ThemePresetId): void => {
    setThemeDraft(id);
    applyDocumentTheme(id, appearanceDraft);
  };

  const selectAppearance = (mode: AppearanceMode): void => {
    setAppearanceDraft(mode);
    applyDocumentTheme(themeDraft, mode);
  };

  const renderConfigurableList = (opts: {
    title: string;
    description: string;
    order: string[];
    setOrder: Dispatch<SetStateAction<string[]>>;
    labels: Record<string, string>;
    setLabels: Dispatch<SetStateAction<Record<string, string>>>;
    hidden: Set<string>;
    setHidden: Dispatch<SetStateAction<Set<string>>>;
    builtinSet: Set<string>;
    defaultLabels: Record<string, string>;
    newSlug: string;
    setNewSlug: (s: string) => void;
    slugError: string;
    setSlugError: (s: string) => void;
    addLabelPlaceholder: string;
  }): JSX.Element => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{opts.title}</CardTitle>
        <p className="text-xs text-muted-foreground">{opts.description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/60 bg-card/30 p-3">
          <div className="min-w-[200px] flex-1">
            <Label className="text-xs text-muted-foreground">New option id (slug)</Label>
            <Input
              className="mt-1 font-mono text-sm"
              value={opts.newSlug}
              onChange={(e) => opts.setNewSlug(e.target.value.toLowerCase())}
              placeholder="e.g. wellfound_apply"
            />
            {opts.slugError ? (
              <p className="mt-1 text-xs text-destructive">{opts.slugError}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mb-0.5"
            onClick={() =>
                tryAddCustomSlug(
                  opts.newSlug,
                  opts.builtinSet,
                  opts.order,
                  opts.setOrder,
                  opts.setLabels,
                  opts.setSlugError,
                  opts.addLabelPlaceholder,
                )
            }
          >
            <Plus size={14} /> Add
          </Button>
        </div>

        {opts.order.map((id, i) => {
          const isBuiltin = opts.builtinSet.has(id);
          return (
            <div
              key={id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-card/50 px-3 py-2"
            >
              <div className="flex flex-col gap-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1"
                  disabled={i === 0}
                  onClick={() =>
                    opts.setOrder((prev) => {
                      const j = i - 1;
                      if (j < 0) return prev;
                      const next = [...prev];
                      [next[i], next[j]] = [next[j], next[i]];
                      return next;
                    })
                  }
                  aria-label="Move up"
                >
                  <ChevronUp size={14} />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1"
                  disabled={i === opts.order.length - 1}
                  onClick={() =>
                    opts.setOrder((prev) => {
                      const j = i + 1;
                      if (j >= prev.length) return prev;
                      const next = [...prev];
                      [next[i], next[j]] = [next[j], next[i]];
                      return next;
                    })
                  }
                  aria-label="Move down"
                >
                  <ChevronDown size={14} />
                </Button>
              </div>
              <code className="hidden w-44 shrink-0 text-[11px] text-muted-foreground sm:block">
                {id}
              </code>
              <div className="min-w-[200px] flex-1">
                <Label className="sr-only">Label for {id}</Label>
                <Input
                  value={opts.labels[id] ?? ''}
                  onChange={(e) =>
                    opts.setLabels((prev) => ({
                      ...prev,
                      [id]: e.target.value,
                    }))
                  }
                  placeholder={opts.defaultLabels[id] ?? id}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={opts.hidden.has(id)}
                  onChange={(e) => {
                    opts.setHidden((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(id);
                      else next.delete(id);
                      return next;
                    });
                  }}
                />
                Hide
              </label>
              {!isBuiltin ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    removeCustomFromOrder(
                      id,
                      opts.builtinSet,
                      opts.setOrder,
                      opts.setHidden,
                      opts.setLabels,
                    )
                  }
                  aria-label={`Remove ${id}`}
                >
                  <Trash2 size={14} />
                </Button>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );

  return (
    <>
      <PageHeader
        title="Settings"
        description="Theme, appearance, and selector options used across applications and search sessions."
      />

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Appearance</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            {APPEARANCE_MODES.map((mode) => {
              const active = appearanceDraft === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => selectAppearance(mode)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-accent/30 ring-2 ring-ring'
                      : 'border-border bg-card hover:border-primary/40',
                  )}
                >
                  {APPEARANCE_LABELS[mode]}
                </button>
              );
            })}
          </div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Color preset</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {THEME_PRESETS.map((t) => {
              const active = themeDraft === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTheme(t.id)}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-colors',
                    active
                      ? 'border-primary bg-accent/30 ring-2 ring-ring'
                      : 'border-border bg-card hover:border-primary/40',
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium">{t.label}</span>
                    {active ? (
                      <Check size={18} className="text-primary" />
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{t.hint}</p>
                  <div
                    className={cn(
                      'mt-3 h-2 rounded-full',
                      THEME_PRESET_SWATCH_CLASS[t.id],
                    )}
                  />
                </button>
              );
            })}
          </div>
        </section>

        {renderConfigurableList({
          title: 'Application methods',
          description:
            'Reorder, rename, hide, or add custom methods (slug id). Existing application data keeps stored ids.',
          order: methodOrder,
          setOrder: setMethodOrder,
          labels: labelByMethod,
          setLabels: setLabelByMethod,
          hidden: hiddenMethods,
          setHidden: setHiddenMethods,
          builtinSet: BUILTIN_METHOD,
          defaultLabels: methodLabels as Record<string, string>,
          newSlug: newMethodSlug,
          setNewSlug: setNewMethodSlug,
          slugError: methodSlugError,
          setSlugError: setMethodSlugError,
          addLabelPlaceholder: '',
        })}

        {renderConfigurableList({
          title: 'Position types',
          description: 'Used in the application form and filters.',
          order: positionOrder,
          setOrder: setPositionOrder,
          labels: labelByPosition,
          setLabels: setLabelByPosition,
          hidden: hiddenPositions,
          setHidden: setHiddenPositions,
          builtinSet: BUILTIN_POSITION,
          defaultLabels: positionLabels as Record<string, string>,
          newSlug: newPositionSlug,
          setNewSlug: setNewPositionSlug,
          slugError: positionSlugError,
          setSlugError: setPositionSlugError,
          addLabelPlaceholder: '',
        })}

        {renderConfigurableList({
          title: 'Employment types',
          description: 'Employment type selector on the application form.',
          order: employmentOrder,
          setOrder: setEmploymentOrder,
          labels: labelByEmployment,
          setLabels: setLabelByEmployment,
          hidden: hiddenEmployment,
          setHidden: setHiddenEmployment,
          builtinSet: BUILTIN_EMPLOYMENT,
          defaultLabels: employmentLabels as Record<string, string>,
          newSlug: newEmploymentSlug,
          setNewSlug: setNewEmploymentSlug,
          slugError: employmentSlugError,
          setSlugError: setEmploymentSlugError,
          addLabelPlaceholder: '',
        })}

        {renderConfigurableList({
          title: 'Search session platforms',
          description: 'Platforms when logging a job search session or filtering sessions.',
          order: searchPlatformOrder,
          setOrder: setSearchPlatformOrder,
          labels: labelBySearchPlatform,
          setLabels: setLabelBySearchPlatform,
          hidden: hiddenSearchPlatforms,
          setHidden: setHiddenSearchPlatforms,
          builtinSet: BUILTIN_SEARCH_PLATFORM,
          defaultLabels: searchPlatformLabels as Record<string, string>,
          newSlug: newSearchPlatformSlug,
          setNewSlug: setNewSearchPlatformSlug,
          slugError: searchPlatformSlugError,
          setSlugError: setSearchPlatformSlugError,
          addLabelPlaceholder: '',
        })}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Role title options</CardTitle>
            <p className="text-xs text-muted-foreground">
              Values shown in the application form “Role” selector (exact strings saved).
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {roleTitleOptions.map((row, idx) => (
              <div key={`role-${idx}`} className="flex gap-2">
                <Input
                  value={row}
                  onChange={(e) => {
                    const next = [...roleTitleOptions];
                    next[idx] = e.target.value;
                    setRoleTitleOptions(next);
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setRoleTitleOptions(roleTitleOptions.filter((_, i) => i !== idx))
                  }
                  aria-label="Remove row"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRoleTitleOptions([...roleTitleOptions, ''])}
            >
              <Plus size={14} /> Add role option
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resume used options</CardTitle>
            <p className="text-xs text-muted-foreground">
              Labels for which CV version you sent (free text per application).
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {resumeVersionOptions.map((row, idx) => (
              <div key={`res-${idx}`} className="flex gap-2">
                <Input
                  value={row}
                  onChange={(e) => {
                    const next = [...resumeVersionOptions];
                    next[idx] = e.target.value;
                    setResumeVersionOptions(next);
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setResumeVersionOptions(
                      resumeVersionOptions.filter((_, i) => i !== idx),
                    )
                  }
                  aria-label="Remove row"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setResumeVersionOptions([...resumeVersionOptions, ''])}
            >
              <Plus size={14} /> Add resume option
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Work mode labels</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ALL_WORK_MODES.map((w) => (
              <div key={w}>
                <Label className="text-xs text-muted-foreground">{w}</Label>
                <Input
                  className="mt-1"
                  value={labelByWorkMode[w] ?? ''}
                  onChange={(e) =>
                    setLabelByWorkMode((prev) => ({
                      ...prev,
                      [w]: e.target.value,
                    }))
                  }
                  placeholder={workModeLabels[w]}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <span
            className="text-xs text-muted-foreground"
            aria-live="polite"
            role="status"
          >
            {isUpdating ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" />
                Saving…
              </span>
            ) : isDirty ? (
              <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <CloudUpload size={14} />
                Unsaved changes
              </span>
            ) : lastAutoSavedAt ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={14} />
                All changes saved
              </span>
            ) : null}
          </span>
          <Button
            onClick={() => void handleSave()}
            loading={isUpdating}
            disabled={!settings || !isDirty}
          >
            <Save size={16} /> Save settings
          </Button>
        </div>
      </div>
    </>
  );
}
