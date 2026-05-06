# Frontend deep dive

> React 18, Vite 6, TypeScript 5.7, TanStack Query 5, React Router 6,
> Tailwind 3, Radix-style primitives, Recharts 2, Sonner, Lucide icons,
> `date-fns`. Source lives under `frontend/src/`.

The frontend is a single-page application (SPA). It assumes a single
operator (no auth) and talks to the REST API documented in
[`api.md`](./api.md).

---

## 1. Source tree

```
frontend/
├── index.html                          # Vite entry, single <div id="root"/>
├── nginx.conf                          # SPA fallback for production image
├── public/                              # static assets (favicon, etc.)
└── src/
    ├── main.tsx                        # bootstrap (providers + Toaster)
    ├── App.tsx                         # <Routes> declaration
    ├── index.css                       # design tokens + 12 presets × 6 modes
    ├── vite-env.d.ts
    ├── api/                            # axios call sites, one per resource
    │   ├── applications.ts
    │   ├── dashboard.ts
    │   ├── events.ts
    │   ├── platform-settings.ts
    │   ├── search-sessions.ts
    │   └── templates.ts
    ├── components/
    │   ├── applications/               # row, form, filters, status changer, timeline
    │   ├── dashboard/                  # KPI card, distribution bars, funnel, time series, heatmap
    │   ├── layout/                     # AppShell, Sidebar, PageHeader
    │   ├── status/                     # StatusBadge
    │   └── ui/                         # primitives: button, card, input, modal, select, …
    ├── context/
    │   └── platform-settings-context.tsx
    ├── hooks/                          # one TanStack Query hook file per resource + use-debounced-value
    ├── lib/                            # cross-cutting helpers (api, theme, formatting, palette, query client)
    ├── pages/                          # route-level components
    └── types/                          # enums, label maps, model and platform-settings types
```

---

## 2. Bootstrap (`main.tsx`)

```tsx
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PlatformSettingsProvider>
          <App />
          <ThemeAwareToaster />
        </PlatformSettingsProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- **Strict mode** in development (double-effect detection).
- **TanStack Query** is the only data layer. Settings:
  - `staleTime: 30s`
  - `refetchOnWindowFocus: false`
  - `retry: 1` for queries, `0` for mutations.
- **`BrowserRouter`** for client-side routing.
- **`PlatformSettingsProvider`** wraps everything because every form,
  filter and dashboard panel reads from it.
- **`ThemeAwareToaster`** picks `light`/`dark` Sonner theme based on the
  active appearance mode.

`App.tsx` is a flat route table:

| Path | Component | Notes |
| ---- | --------- | ----- |
| `/` | `DashboardPage` | tabs: Pipeline / Search activity. |
| `/applications` | `ApplicationsListPage` | filters + paginated rows. |
| `/applications/:id` | `ApplicationDetailPage` | edit, status changer, timeline, contacts. |
| `/search-sessions` | `SearchSessionsPage` | log + browse search sessions. |
| `/templates` | `TemplatesPage` | template library. |
| `/settings` | `SettingsPage` | theme + selectors + role/resume options. |
| `*` | `<Navigate to="/" replace />` | unknown paths → dashboard. |

Routes are mounted inside `<AppShell />`, which renders a fixed-width
`Sidebar` and a centered content area (`max-w-[1400px]`).

---

## 3. API client (`lib/api.ts`)

A single shared `axios` instance:

- `baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api'`.
- Default `Content-Type: application/json`.
- A response interceptor parses the standard error envelope (`{ statusCode,
  error, message }`), joins `message` arrays with `' • '`, raises a Sonner
  toast, and rejects with a typed `ApiError`. Toast titles map to status
  ranges:
  - 400 → `Invalid request`
  - 403 → `Forbidden`
  - 404 → `Not found`
  - other 4xx → `Request failed`
  - 5xx → `Server error`
  - network failure → `Connection error`
- Exports `Paginated<T>` mirroring `PaginatedResult<T>` from the backend.

Each module under `src/api/` is a small object literal (`applicationsApi`,
`platformSettingsApi`, …) wrapping `axios` calls with typed payloads. They
**never** mutate caches directly — that is the hooks' job.

---

## 4. Hooks (TanStack Query)

Every API resource has a hook file under `src/hooks/`:

| Hook file | Purpose |
| --------- | ------- |
| `use-applications.ts` | List, detail, create, update, change-status, archive, restore, delete, mark-stale-ghosted. |
| `use-events.ts` | List by application, create, delete. |
| `use-search-sessions.ts` | List, create, update, delete. |
| `use-templates.ts` | List, create, update, toggle favorite, mark used, delete. |
| `use-dashboard.ts` | Pipeline overview + search activity overview. |
| `use-debounced-value.ts` | Generic 300 ms debouncer used in filters. |

Conventions used everywhere:

- Stable `*Keys` namespace per resource (`applicationKeys.detail(id)`,
  `applicationKeys.list(filters)`, `applicationKeys.lists()`).
- `onSuccess` invalidates **every** key affected by the write. Examples:
  - `useCreateApplication` invalidates `applications/list/*`, `dashboard/*`,
    `search-sessions/*`.
  - `useChangeStatus(id)` invalidates `applications/detail/:id`,
    `applications/list/*`, `events/application/:id`, `dashboard/*`.
  - `useArchive` / `useRestore` only invalidate `applications/list/*`.
- Sonner toasts are emitted directly inside `onSuccess` so the user gets
  immediate feedback even before re-fetch. Errors come from the axios
  interceptor.

The list page debounces the `search` input through `useDebouncedValue` and
memoizes the final filter object (`queryFilters`) so a keystroke does not
generate a new query key on every change.

---

## 5. `PlatformSettingsContext`

`context/platform-settings-context.tsx` is the spine of the application.
Responsibilities:

1. Fetch `/platform-settings` once via TanStack Query (`staleTime 30s`).
2. Apply the `themeId` + `appearanceMode` to `<html>` whenever they change.
3. Build memoized **`effective*Labels`** records by merging built-in labels
   from `types/labels.ts` with overrides from `formConfig.*Labels`.
4. Build memoized **`*SelectOptions`** arrays for each configurable
   selector via `buildOrderedSelectOptions(builtIns, customs, labels, order, hidden)`:
   - Universe = built-ins ∪ customs.
   - If a stored `order` is a permutation of the universe, use it; otherwise
     fall back to the natural order.
   - Drop ids in `hidden`.
   - Resolve labels via the merged record.
5. Surface `roleTitleOptions` / `resumeVersionOptions` (defaults from
   `lib/form-defaults.ts` if the server returned empty arrays).
6. Expose `updateSettings(input)` (mutation) so any page can patch
   settings; the mutation `setQueryData`s the response and re-applies
   `applyDocumentTheme`.

`usePlatformSettings()` throws if used outside the provider. Consumers
include forms (`ApplicationForm`, `SearchSessionForm`), filters
(`ApplicationFiltersBar`), the dashboard, the templates page, and the row
component. None of them know that the lists may include user-defined
slugs — they just iterate the `*SelectOptions` array.

---

## 6. Theming (`lib/apply-theme.ts`, `lib/theme-presets.ts`, `index.css`)

Theme is the product of two axes:

- **Theme preset** (12): `ocean`, `sky`, `indigo`, `violet`, `fuchsia`,
  `rose`, `coral`, `terracotta`, `amber`, `lime`, `emerald`, `slate`.
- **Appearance mode** (6): `dark`, `night`, `dim`, `mist`, `soft`, `light`.

Every preset/mode combination is encoded as CSS custom properties on
`<html>`:

- Mode adds a class (`dark`, `night`, …) which sets shell tokens
  (`--background`, `--foreground`, `--card`, `--secondary`, `--border`, …).
- Preset adds `theme-preset-<id>` which sets accent tokens
  (`--primary`, `--ring`, `--accent`, `--accent-foreground`) **and**
  `--chart-1` … `--chart-5`, `--chart-foreground`.

`applyDocumentTheme(themeId, appearance)`:

1. Validates both ids against the readonly tuples
   (`THEME_PRESET_IDS`, `APPEARANCE_MODES`).
2. Removes any prior `theme-preset-*` and any of the 6 mode classes.
3. Adds the new ones.
4. Mirrors them into `localStorage` (`applyhub-theme`,
   `applyhub-appearance`) so the next reload renders before the API call
   resolves (anti-FOUC).

`getAppliedThemeSnapshot()` reads the classes on `<html>` first, then
`localStorage`, then falls back to `{ ocean, dark }`.

`PlatformSettingsContext` calls `applyDocumentTheme` whenever the server
state changes; the Settings page also calls it on every preset / mode
click for instant preview before persisting.

`lib/chart-palette.ts` exposes `chartColor(1..5)`, `categoricalChartColor(i)`,
`ordinalChartColor(i, total)`. All charts go through these helpers — never
hard-coded hex colors — so they re-skin per theme automatically.

---

## 7. Vocabularies and labels

`types/enums.ts` mirrors the backend enums **as `as const` records** to
keep them tree-shakeable and avoid TS `enum` semantics. They are the
literal value sets the API accepts.

`types/labels.ts` (consumed via `effective*Labels` in the context) is the
default label map. It is the floor for the user-configurable overrides.

Custom slugs added in Settings flow through the system unchanged:

- The Settings page validates `^[a-z][a-z0-9_]{0,47}$` client-side (see
  `CUSTOM_OPTION_KEY_REGEX`).
- The backend re-validates server-side
  ([`database.md`](./database.md#3-configurable-vocabularies-formconfig)).
- They appear in form selects, filters, dashboard distributions, the row
  component, and the timeline — by virtue of `effective*Labels[id] ?? id`.

---

## 8. Pages

### 8.1 Dashboard (`pages/dashboard.tsx`)

Two tabs: **Pipeline** and **Search activity**. Each panel:

- Reads optional `fromDate` / `toDate` from page-level state (rendered as
  date pickers in `PageHeader.actions`).
- Calls `useDashboard` / `useSearchActivity` with those params.
- Renders KPI cards, charts, distributions and tables.

`PipelineDashboardPanel` highlights:

- Two rows of `KpiCard`s: counts (Total / Active / Interviewing / Offers)
  and rates (Response / Interview / Offer / Days-to-first-response).
- `TimeSeriesChart` (applications per day) + `FunnelChart` (5 steps).
- 4 `DistributionBars` panels: status, method, position, work mode. Each
  resolves labels via `effective*Labels`.
- `ActivityHeatmap`: 7×24 grid driven by `data.activityHeatmap`.
- "Method effectiveness" table: per-method `total / responseRate /
  interviewRate / offerRate` (sorted by total desc on the backend).
- "Top companies" + "Quick actions" with the **Mark stale as ghosted**
  button (calls `POST /applications/mark-stale-ghosted` with the default
  21-day cutoff).

`SearchActivityPanel`:

- KPI cards (sessions / applications linked).
- Searches per day chart + per-platform / per-completion distributions.
- Top queries (15 dedup'd, original casing) and recent sessions (latest 20
  with `applicationsCount`).
- Helper `sessionPlatformLabel` renders `Other (<platformOther>)` for the
  `other` platform when `platformOther` is set.

### 8.2 Applications (`pages/applications/list.tsx`, `pages/applications/detail.tsx`)

`ApplicationsListPage`:

- Filters bar (`ApplicationFiltersBar`) writes into a `filters` state.
- `search` is debounced 300 ms before being sent.
- Renders `ApplicationRow` for each result. Pagination controls show
  current page only when `totalPages > 1`.
- "New application" opens a `Modal` containing `ApplicationForm`. On
  success the modal closes and queries are invalidated.

`ApplicationDetailPage` (not shown above, see file): edits the row,
exposes `StatusChanger`, lists linked contacts, and renders `Timeline`
backed by `useEvents(applicationId)`.

`StatusChanger` posts to `PATCH /applications/:id/status` with the chosen
`status`, `stage`, optional `channel`, `title`, `description`, and
optional `metadata`. The backend wraps this in a transaction (see
[`backend.md`](./backend.md#41-applicationsmodule)) and emits the right
event type.

### 8.3 Search sessions (`pages/search-sessions.tsx`)

CRUD + filter, with `platform` validated against
`searchPlatformSelectOptions`. When `platform === 'other'`, a
`platformOther` text input is exposed; switching away clears it.

### 8.4 Templates (`pages/templates.tsx`)

CRUD + favorite toggle + copy-to-clipboard. Copying a template increments
its usage counter via `markUsed` so the next list query reflects new
ordering.

### 8.5 Settings (`pages/settings.tsx`)

Single, autosaving page. Highlights:

1. **Theme + appearance**. Click any swatch and `applyDocumentTheme` runs
   immediately for instant preview.
2. **Five reorderable lists**: application methods, position types,
   employment types, search platforms, work modes (work-mode is label-only,
   no reorder/hide because the codebase relies on the four built-ins).
3. **Custom slugs** validated by `CUSTOM_OPTION_KEY_REGEX`, then sent to
   the backend which performs the same check server-side.
4. **`diffLabels`**: only labels that differ from the built-in defaults
   are persisted in `formConfig.*Labels`. This keeps the JSONB blob small
   and the Settings page idempotent.
5. **`stableSerialize`** of `builtConfig` produces a deterministic string
   used as a "signature" to detect unsaved changes.
6. **Autosave**: a 700 ms debounce of `isDirty` triggers `persistDraft(false)`
   (no toast, only a "Saved" status indicator). The `Save settings` button
   triggers `persistDraft(true)` (with toast).
7. **Footer status**: "Unsaved changes" / "Saving…" / "All changes saved"
   driven by `isDirty`, `isUpdating`, and `lastAutoSavedAt`.

---

## 9. Component primitives (`components/ui/`)

Lightweight, dependency-free implementations:

| Component | Notes |
| --------- | ----- |
| `Button` | `variant: default | outline | secondary | ghost | destructive`, `size: sm | md | lg`, `loading` swap, polymorphic via `asChild` (Radix-style). |
| `Card`, `CardHeader`, `CardTitle`, `CardContent` | Styled containers. |
| `Input`, `Textarea`, `Label`, `Select` | Native HTML elements with consistent styling. |
| `Modal` | Portal-backed overlay (`size: sm | md | lg`), traps focus and supports `description`. |
| `Badge` | Variants for status/categorical chips. |
| `EmptyState` | Icon + title + description + optional action (e.g. "No applications yet"). |
| `Spinner`, `PageLoader` | Indeterminate loaders. |

`StatusBadge` (`components/status/`) maps `ApplicationStatus` to a color
pulled from CSS custom properties so it re-skins per theme.

`components/dashboard/`:

- `KpiCard` (label + value + icon + accent color slot 1..5 + optional hint).
- `DistributionBars` (horizontal bars with counts + percentages).
- `FunnelChart` (Recharts funnel with `ordinalChartColor`).
- `TimeSeriesChart` (Recharts area).
- `ActivityHeatmap` (CSS grid driven by tailwind opacity classes).

`components/layout/`:

- `AppShell` (fixed Sidebar + max-1400 content area).
- `Sidebar` (5 NavLink entries, active state via Tailwind classes).
- `PageHeader` (title + description + optional `actions` slot).

---

## 10. Build, dev, and deploy

### Local development

```bash
cd frontend
npm install
npm run dev          # vite dev server on :5173 (proxies API by VITE_API_URL)
```

`vite.config.ts` enables React + the `@/*` alias (resolved to
`frontend/src/*`).

### Production

`Dockerfile` does a 2-stage build:

1. `node:20-alpine` runs `npm ci` + `npm run build` → static files in
   `dist/`.
2. `nginx:alpine` copies `dist/` and `nginx.conf` and serves on port 80.

`nginx.conf` uses a single `try_files $uri /index.html;` block so any
unknown route falls back to the SPA shell. Built assets are versioned by
Vite (hashed file names), so far-future cache headers can be applied
safely.

The container is wired in `docker-compose.yml` with `VITE_API_URL` baked
into the build stage. To change the API host you must rebuild the image
(or use a reverse proxy in front, see [`operations.md`](./operations.md)).

### Tooling

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Vite dev server. |
| `npm run build` | TypeScript check + Vite build. |
| `npm run preview` | Serve the production build locally. |
| `npm run lint` / `format` | ESLint with `--fix`; Prettier. |

The repository does not ship frontend tests yet; the SPA depends entirely
on the backend contract documented in [`api.md`](./api.md). See
[`testing.md`](./testing.md) for the backend test plan.
