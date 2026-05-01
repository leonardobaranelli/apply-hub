import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout/page-header';
import { usePlatformSettings } from '@/context/platform-settings-context';
import { applyDocumentTheme } from '@/lib/apply-theme';
import { THEME_PRESETS, type ThemePresetId } from '@/lib/theme-presets';
import { ApplicationMethod, WorkMode } from '@/types/enums';
import { methodLabels, workModeLabels } from '@/types/labels';
import type { PlatformFormConfig } from '@/types/platform-settings';
import { cn } from '@/lib/cn';

const ALL_METHODS = Object.values(ApplicationMethod);
const ALL_WORK_MODES = Object.values(WorkMode);

function normalizeMethodOrder(
  cfg: PlatformFormConfig | undefined,
): ApplicationMethod[] {
  const order = cfg?.applicationMethodOrder?.filter((k) =>
    ALL_METHODS.includes(k as ApplicationMethod),
  ) as ApplicationMethod[] | undefined;
  const rest = ALL_METHODS.filter((k) => !order?.includes(k));
  return order?.length ? [...order, ...rest] : [...ALL_METHODS];
}

function buildFormConfigFromState(
  methodOrder: ApplicationMethod[],
  labelByMethod: Record<ApplicationMethod, string>,
  hiddenMethods: Set<ApplicationMethod>,
  labelByWorkMode: Record<WorkMode, string>,
): PlatformFormConfig {
  const applicationMethodLabels: Record<string, string> = {};
  for (const m of ALL_METHODS) {
    const v = labelByMethod[m]?.trim() ?? '';
    if (v && v !== methodLabels[m]) applicationMethodLabels[m] = v;
  }
  const workModeLabelsOut: Record<string, string> = {};
  for (const w of ALL_WORK_MODES) {
    const v = labelByWorkMode[w]?.trim() ?? '';
    if (v && v !== workModeLabels[w]) workModeLabelsOut[w] = v;
  }
  return {
    applicationMethodLabels,
    applicationMethodOrder: [...methodOrder],
    applicationMethodHidden: [...hiddenMethods],
    workModeLabels: workModeLabelsOut,
  };
}

export function SettingsPage() {
  const { settings, updateSettings, isUpdating } = usePlatformSettings();
  const [themeDraft, setThemeDraft] = useState<ThemePresetId>('ocean');
  const [methodOrder, setMethodOrder] = useState<ApplicationMethod[]>([
    ...ALL_METHODS,
  ]);
  const [labelByMethod, setLabelByMethod] = useState<
    Record<ApplicationMethod, string>
  >({ ...methodLabels });
  const [hiddenMethods, setHiddenMethods] = useState<Set<ApplicationMethod>>(
    new Set(),
  );
  const [labelByWorkMode, setLabelByWorkMode] = useState<Record<WorkMode, string>>(
    { ...workModeLabels },
  );

  useEffect(() => {
    if (!settings) return;
    const cfg = settings.formConfig ?? {};
    setThemeDraft(settings.themeId as ThemePresetId);
    setMethodOrder(normalizeMethodOrder(cfg));
    const nextLabels = { ...methodLabels };
    for (const [k, v] of Object.entries(cfg.applicationMethodLabels ?? {})) {
      if (v && ALL_METHODS.includes(k as ApplicationMethod)) {
        nextLabels[k as ApplicationMethod] = v;
      }
    }
    setLabelByMethod(nextLabels);
    setHiddenMethods(new Set((cfg.applicationMethodHidden ?? []) as ApplicationMethod[]));
    const wm = { ...workModeLabels };
    for (const [k, v] of Object.entries(cfg.workModeLabels ?? {})) {
      if (v && ALL_WORK_MODES.includes(k as WorkMode)) {
        wm[k as WorkMode] = v;
      }
    }
    setLabelByWorkMode(wm);
  }, [settings]);

  const isDirty = useMemo(() => {
    if (!settings) return false;
    const next = buildFormConfigFromState(
      methodOrder,
      labelByMethod,
      hiddenMethods,
      labelByWorkMode,
    );
    const prevCfg = settings.formConfig ?? {};
    const prev: PlatformFormConfig = {
      applicationMethodLabels: prevCfg.applicationMethodLabels ?? {},
      applicationMethodOrder: normalizeMethodOrder(prevCfg),
      applicationMethodHidden: prevCfg.applicationMethodHidden ?? [],
      workModeLabels: prevCfg.workModeLabels ?? {},
    };
    return (
      themeDraft !== settings.themeId ||
      JSON.stringify(next) !== JSON.stringify(prev)
    );
  }, [
    settings,
    themeDraft,
    methodOrder,
    labelByMethod,
    hiddenMethods,
    labelByWorkMode,
  ]);

  const moveMethod = (index: number, dir: -1 | 1): void => {
    const j = index + dir;
    if (j < 0 || j >= methodOrder.length) return;
    setMethodOrder((prev) => {
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const handleSave = async (): Promise<void> => {
    if (!settings) return;
    try {
      const formConfig = buildFormConfigFromState(
        methodOrder,
        labelByMethod,
        hiddenMethods,
        labelByWorkMode,
      );
      await updateSettings({
        themeId: themeDraft,
        formConfig,
      });
      toast.success('Settings saved');
    } catch {
      /* toast from api interceptor */
    }
  };

  const selectTheme = (id: ThemePresetId): void => {
    setThemeDraft(id);
    applyDocumentTheme(id);
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Theme and labels for selectors across the app."
      />

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Theme</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                      t.id === 'ocean' && 'bg-[hsl(188,86%,48%)]',
                      t.id === 'violet' && 'bg-[hsl(263,72%,58%)]',
                      t.id === 'emerald' && 'bg-[hsl(158,64%,42%)]',
                      t.id === 'rose' && 'bg-[hsl(350,72%,56%)]',
                      t.id === 'amber' && 'bg-[hsl(38,92%,50%)]',
                      t.id === 'slate' && 'bg-[hsl(215,22%,58%)]',
                    )}
                  />
                </button>
              );
            })}
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application method selectors</CardTitle>
            <p className="text-xs text-muted-foreground">
              Reorder, rename labels, or hide methods from dropdowns (existing data
              is unchanged).
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {methodOrder.map((m, i) => (
              <div
                key={m}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-card/50 px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1"
                    disabled={i === 0}
                    onClick={() => moveMethod(i, -1)}
                    aria-label="Move up"
                  >
                    <ChevronUp size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1"
                    disabled={i === methodOrder.length - 1}
                    onClick={() => moveMethod(i, 1)}
                    aria-label="Move down"
                  >
                    <ChevronDown size={14} />
                  </Button>
                </div>
                <code className="hidden w-40 shrink-0 text-[11px] text-muted-foreground sm:block">
                  {m}
                </code>
                <div className="min-w-[200px] flex-1">
                  <Label className="sr-only">Label for {m}</Label>
                  <Input
                    value={labelByMethod[m] ?? ''}
                    onChange={(e) =>
                      setLabelByMethod((prev) => ({
                        ...prev,
                        [m]: e.target.value,
                      }))
                    }
                    placeholder={methodLabels[m]}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={hiddenMethods.has(m)}
                    onChange={(e) => {
                      setHiddenMethods((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(m);
                        else next.delete(m);
                        return next;
                      });
                    }}
                  />
                  Hide
                </label>
              </div>
            ))}
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

        <div className="flex justify-end">
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
