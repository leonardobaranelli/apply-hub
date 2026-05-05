# ApplyHub

Personal full‑stack hub that treats **every application as a first‑class entity**: status, stage, priority, salary, contacts, originating search session, auditable timeline, and derived analytics — all in one queryable place.

> Single‑operator by design. **There is no authentication**: it runs behind a network perimeter you control (local network, tunnel, VPN, reverse proxy with auth).

---

## 1. Stack

| Layer | Technology |
| ----- | ---------- |
| API | NestJS 10 · Prisma 5 · PostgreSQL 16 · class‑validator/transformer · Joi · Swagger (`/api/docs` disabled in production) |
| Web | React 18 + Vite 6 · TypeScript 5 · TanStack Query 5 · React Hook Form + Zod · Tailwind 3 · Recharts 2 · Sonner · Lucide |
| Infra | Docker Compose (`postgres` + `backend` + `frontend`) · multi‑stage Dockerfiles (`development` + `production`); in prod the SPA is served with `nginx:alpine` and the API with `node dist/main.js` |

---

## 2. Repository layout

```
apply-hub/
├── backend/
│   ├── prisma/schema.prisma           # schema source of truth
│   ├── scripts/                       # ops on primary and replica (mjs)
│   │   ├── db-status.mjs              # parity between primary and replica
│   │   ├── db-sync.mjs                # full snapshot via pg_dump|psql in container
│   │   ├── db-sync-incremental.mjs    # paginated upsert by id, only if updatedAt > destination
│   │   ├── ensure-text-selector-columns.mjs  # migrates legacy PG enums → VARCHAR (idempotent)
│   │   ├── run-on-replica.mjs         # runs any command with DATABASE_URL=replica
│   │   └── prisma-studio-local.mjs    # opens Studio resolving `postgres` → `localhost:5432`
│   └── src/
│       ├── main.ts                    # bootstrap (prefix `/api`, CORS, ValidationPipe, global filter, Swagger)
│       ├── app.module.ts              # ConfigModule (Joi) + Prisma + 7 feature modules
│       ├── common/
│       │   ├── dto/pagination.dto.ts  # PaginationDto (page≥1, limit 1..200, default 25) + PaginatedResult<T>
│       │   └── filters/http-exception.filter.ts
│       ├── config/                    # typed configuration() + validation.schema (Joi)
│       ├── prisma/                    # @Global PrismaService with write‑mirror middleware
│       ├── database/seed.ts           # 12 templates (6 EN + 6 ES) idempotent
│       └── modules/
│           ├── applications/          # controller · service · dto · domain (StatusResolverService, enums)
│           ├── application-events/    # append‑only timeline
│           ├── contacts/              # reusable people (m:n with applications)
│           ├── search-sessions/       # reproducible log of each search
│           ├── templates/             # cover letters, messages, follow‑ups
│           ├── dashboard/             # KPIs, funnel, heatmap, distributions, search activity
│           └── platform-settings/     # single row (id="default") with vocabulary + theme
├── frontend/
│   ├── nginx.conf                     # SPA fallback `try_files $uri /index.html`
│   ├── vite.config.ts                 # alias `@` → src; host 0.0.0.0, polling
│   ├── tailwind.config.js             # HSL tokens via CSS vars (theming)
│   └── src/
│       ├── main.tsx, App.tsx          # router + QueryClient + PlatformSettingsProvider + Toaster
│       ├── api/                       # 1 typed axios client per resource
│       ├── components/                # ui primitives, applications, dashboard, layout, status
│       ├── context/                   # PlatformSettingsProvider (theme + vocabulary in one source)
│       ├── hooks/                     # 1 Query/Mutation hooks file per resource
│       ├── lib/                       # api · query‑client · theme · format · chart‑palette · cn · form‑*
│       ├── pages/                     # dashboard, applications/list, applications/detail, search‑sessions, templates, settings
│       └── types/                     # enums, labels, models, platform‑settings DTOs
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 3. Architecture

### 3.1 Canonical shape of a backend module

```
modules/<feature>/
├── <feature>.controller.ts   # HTTP surface — binding and validation only
├── <feature>.service.ts      # use cases, persistence, transactions
├── <feature>.module.ts       # wiring + cross imports
├── domain/                   # enums, pure helpers, resolvers (no Nest deps when possible)
└── dto/                      # class‑validator DTOs (request + query)
```

Rules the codebase follows:

- Services read configuration **only** via `ConfigService`, never `process.env`.
- Services use Prisma **only** via `PrismaService` (`PrismaClient` is not instantiated in modules).
- Status transition logic (`defaultStageFor`, `isFirstResponseTransition`, `isClosingTransition`) lives in `applications/domain/status-resolver.service.ts` and is reused from the dashboard.
- Vocabulary validation (custom slugs, order, hidden, labels) lives in `platform-settings/domain/form-config.helpers.ts` and applies both when saving `PlatformSettings` and when creating/updating `Application`/`SearchSession`.

### 3.2 Cross‑cutting

`src/main.ts` does exactly:

1. Creates Nest with `bufferLogs: true`.
2. Applies `app.setGlobalPrefix('api')`.
3. Enables CORS accepting `CORS_ORIGIN` as a comma‑separated list (`o.trim()`).
4. Registers `ValidationPipe({ whitelist, forbidNonWhitelisted, transform, transformOptions: { enableImplicitConversion: true } })`.
5. Registers global `HttpExceptionFilter` → uniform response `{ statusCode, message, error, path, timestamp }`. Logs with stack only when `status >= 500`.
6. Mounts Swagger at `/api/docs` **except** in `production`.
7. Calls `app.listen(port)`.

`PaginationDto` is the base for all `Query` DTOs: `page` (≥1, default 1) and `limit` (1..200, default 25). The paginated response envelope is:

```ts
type PaginatedResult<T> = {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};
```

### 3.3 PrismaService and write‑mirror replica

`PrismaService` (in `@Global() PrismaModule`) extends `PrismaClient` and, **if `DATABASE_URL_REPLICA` is set**, installs a `$use(...)` middleware that:

1. **Pre‑generates UUIDs** on `create` / `createMany` before delegating to the primary, so primary and replica end up with the same PK.
2. After success on the primary, **enqueues** the same operation against the replica (operations in `{create, createMany, update, updateMany, upsert, delete, deleteMany}`).
3. The queue is **serial** (`replicationQueue: Promise<void>` chained) to preserve write order and avoid FK races.
4. Uses **`structuredClone(params.args)`** before enqueueing to avoid reading in‑flight mutations.
5. **Retries up to 4 times with backoff `100/250/500ms`** when the error is `P2003` (FK violated) — typical when a child replicates before the parent.
6. If the replica is down at startup, logs a warning and the app keeps running against the primary (graceful degradation). Reads **never** go to the replica.

Off‑band reconciliation uses the `db:status`, `db:sync*`, and `db:sync:incremental*` scripts (see §7.2).

### 3.4 Frontend

```
frontend/src/
├── main.tsx             React root + QueryClient + BrowserRouter + PlatformSettingsProvider + ThemeAwareToaster
├── App.tsx              route table (all inside <AppShell />)
├── api/                 typed axios client per resource (applications, dashboard, events, platform-settings, search-sessions, templates)
├── components/
│   ├── applications/    application-form, application-filters, application-row, status-changer, timeline
│   ├── dashboard/       activity-heatmap, distribution-bars, funnel-chart, kpi-card, time-series-chart
│   ├── layout/          app-shell, sidebar, page-header
│   ├── status/          status-badge
│   └── ui/              badge, button, card, empty-state, input, label, modal, select, spinner, textarea
├── context/             PlatformSettingsProvider (single source for vocabulary + theme)
├── hooks/               useDashboard, useApplications*, useEvents, useSearchSessions, useTemplates, useDebouncedValue
├── lib/                 api (axios + toast interceptor), query-client, apply-theme, theme-presets, chart-palette, form-defaults, form-select-options, cn, format
├── pages/               dashboard, applications/list, applications/detail, search-sessions, templates, settings
└── types/               enums, labels, models, platform-settings
```

Key frontend decisions:

- **Single `QueryClient`** (`lib/query-client.ts`): `staleTime: 30_000`, `refetchOnWindowFocus: false`, `retry: 1` on queries, `retry: 0` on mutations.
- **Axios interceptor** (`lib/api.ts`): maps the backend error envelope to a typed `ApiError` and shows a `sonner` toast with a contextual title (`Connection error` / `Server error` / `Invalid request` / `Forbidden` / `Not found` / `Request failed`). When `message` is a string[] it joins with ` • `.
- **Context‑driven theming**. `<html>` carries two classes: `{appearanceMode} theme-preset-{themeId}` (e.g. `dim theme-preset-emerald`). `applyDocumentTheme` clears old ones and persists choice in `localStorage` (`applyhub-theme`, `applyhub-appearance`).
- **Recharts theme‑aware**: `lib/chart-palette.ts` exposes `chartColor(1..5)` resolving to `hsl(var(--chart-N))`. Each preset redefines those 5 stops + `--chart-foreground` for correct contrast.
- **Vocabulary‑aware selectors**: `PlatformSettingsProvider` materializes `methodSelectOptions`, `positionSelectOptions`, `employmentSelectOptions`, `searchPlatformSelectOptions`, `workModeSelectOptions`, `roleTitleOptions`, `resumeVersionOptions`. Rename/add/hide/reorder in Settings propagates **immediately** to forms, filters, and detail views.
- **Forms**: React Hook Form + Zod (`zodResolver`). The `'Unspecified'` sentinel on optional selects maps to `null` before submit so strict backend validators (URLs, emails) are not broken.

---

## 4. Domain model

Defined in `backend/prisma/schema.prisma`. **6 aggregates** (+ implicit pivot), all with `@@map` snake_case and explicit indexes.

| Aggregate | Role | Relevant fields |
| --------- | ---- | ---------------- |
| `JobApplication` | One opportunity. Owns status, stage, priority, salary band, denormalized vacancy contact, optional FK to search session. | `position` / `applicationMethod` / `employmentType` / `platform` are **strings** (built‑in IDs **+** custom slugs from Settings). `workMode` is a **strict enum** (`remote` / `hybrid` / `onsite` / `unknown`). `postingLanguage` enum (`en`/`es`). Service‑derived timestamps: `firstResponseAt`, `lastActivityAt`, `closedAt`, `archivedAt`. |
| `JobSearchSession` | Logged search (platform, query, filters, posting window). Aggregates `JobApplication` rows it produced. | `platform` (string), `platformOther` (only when `platform === 'other'`), `queryTitle`, `filterDescription`, `jobPostedFrom` (date), `searchedAt`, `resultsApproxCount`, `isComplete`, `searchUrl`, `notes`. |
| `ApplicationEvent` | Append‑only timeline. One row per status/stage change, message, interview, note, etc. | `type` (enum), `newStatus`, `newStage`, `channel`, `occurredAt`, `metadata` (JSONB with `previousStatus`/`previousStage` on transitions). |
| `Contact` | Reusable people (recruiters, hiring managers, referrals). | `name`, `role`, `companyName`, `email`, `phone`, `linkedinUrl`, `notes`. m:n with `JobApplication` via implicit pivot `_ApplicationContacts`. |
| `Template` | Reusable copy (cover letter, email, messages, follow‑up, …). | `type`, `language`, `tags`, `usageCount`, `isFavorite`, `lastUsedAt`. |
| `PlatformSettings` | Single row (`id="default"`) with UI prefs + vocabulary. | `themeId` (12 values, see §6), `appearanceMode` (6 values), `formConfig` JSONB (end‑to‑end validated, see §4.4). |

**Relevant cascades**:

- `ApplicationEvent.application` → `onDelete: Cascade` (deleting an application deletes its timeline).
- `JobApplication.jobSearchSession` → `onDelete: SetNull` (deleting a session leaves applications with `jobSearchSessionId = null`).

### 4.1 Status pipeline

```
applied → acknowledged → screening → assessment → interview → offer → negotiating → accepted
                                                       ↘
                                       rejected | withdrawn | ghosted | on_hold
```

Defined in `application.enums.ts`:

- `ACTIVE_STATUSES` = `{applied, acknowledged, screening, assessment, interview, offer, negotiating, on_hold}`.
- `TERMINAL_STATUSES` = `{accepted, rejected, withdrawn, ghosted}`.
- `FUNNEL_ORDER` = `[applied, acknowledged, screening, assessment, interview, offer, negotiating, accepted]` — used for conversion and "responded ≥ screening".

### 4.2 `StatusResolverService`

| Method | Behavior |
| ------ | -------- |
| `defaultStageFor(status)` | Maps status → canonical stage when the client omits stage. `applied→submitted`, `acknowledged→auto_reply`, `screening→recruiter_screen`, `assessment→take_home`, `interview→tech_interview_1`, `offer→offer_received`, `negotiating→offer_negotiation`, `accepted→offer_accepted`, `rejected/withdrawn/ghosted/on_hold→closed`. |
| `isFirstResponseTransition(from, to)` | `true` only if `from === 'applied'` and `to !== 'applied'` and `to !== 'ghosted'`. When `true` and `firstResponseAt` is empty, `changeStatus` sets it. |
| `isClosingTransition(to)` | `true` for `accepted/rejected/withdrawn/ghosted`. When `true`, `closedAt = occurredAt`. **If you reopen** to a non‑terminal status, `closedAt` is cleared. |

`firstResponseAt` is also filled when `ApplicationEventsService.create` receives an event of types: `MESSAGE_RECEIVED`, `EMAIL_RECEIVED`, `INTERVIEW_SCHEDULED`, `ASSESSMENT_ASSIGNED`, `FEEDBACK_RECEIVED`, `OFFER_RECEIVED` (and only if still null). Any event bumps `lastActivityAt`.

### 4.3 Auto‑ghost

`POST /applications/mark-stale-ghosted?days=N` (default `21`):

1. Loads all applications with `status ∈ {applied, acknowledged}`.
2. For each, compares `lastActivityAt ?? applicationDate` to `now - N days`.
3. If older, replays `changeStatus(id, { status: ghosted, stage: closed })` — so a normal `ghosted_marked` event is emitted on the timeline and all transactional logic is respected.
4. Returns `{ ghostedCount }`.

### 4.4 Configurable vocabularies (`PlatformSettings.formConfig`)

`assertValidFormConfig` in `PlatformSettingsService` validates every `PATCH /platform-settings`:

- **Custom slugs** (`customApplicationMethods`, `customPositionTypes`, `customEmploymentTypes`, `customSearchPlatforms`):
  - regex `/^[a-z][a-z0-9_]{0,47}$/` (≤ 48 chars).
  - must not collide with built‑ins (Prisma enums).
  - no duplicates within the array.
- **Orders** (`*Order`): if present, must be a **full permutation** of the universe `built‑in ∪ custom` (same length, no duplicates, no unknowns).
- **Hidden** (`*Hidden`): subset of the universe.
- **Labels** (`*Labels`): keys within the universe.
- `workModeLabels`: keys within the `WorkMode` enum (no custom slugs — work mode is intentionally a strict enum).
- `roleTitleOptions`: ≤ 80 entries.
- `resumeVersionOptions`: ≤ 40 entries.

Also, **every write to `JobApplication`/`JobSearchSession` re‑validates** selectors against the current `formConfig`:

- `ApplicationsService.assertApplicationSelectors` checks `applicationMethod`, `position`, `employmentType`.
- `SearchSessionsService.assertSearchPlatform` checks `platform`.

→ If you remove a custom slug from Settings, **existing rows keep it** but you **cannot create new** rows with that value.

---

## 5. HTTP API

Global prefix: **`/api`**. Swagger at `/api/docs` (not in production). All list endpoints extend `PaginationDto`. Errors follow the global envelope; `404` is mapped from `Prisma P2025`.

### 5.1 Applications — `/api/applications`

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/applications` | Create. Validates selectors against `formConfig`. Defaults: `applicationDate=today`, `vacancyPostedDate=applicationDate ?? today`, `stage=defaultStageFor(status)`, `lastActivityAt=now`. **In the same transaction** creates an `ApplicationEvent` `application_submitted` with `metadata: { applicationMethod, source, platform }`. |
| `GET` | `/applications` | Paginated list. Filters: `search` (ILIKE on role/company/notes/location), `status[]`, `stage[]`, `position[]`, `method[]`, `workMode[]`, `priority[]`, `companyName` (ILIKE), `tags[]` (`hasSome`), `fromDate`/`toDate`, `onlyActive`, `includeArchived`. Sort: `applicationDate`/`createdAt`/`updatedAt`/`status`/`priority`/`lastActivityAt`, `asc`/`desc` (default `applicationDate desc`). Without `includeArchived=true`, archived rows are hidden. |
| `GET` | `/applications/:id` | Detail with `contacts` and slim projection of `jobSearchSession`. |
| `PATCH` | `/applications/:id` | Partial update. Does **not** accept `status`/`stage` (use dedicated endpoint). Re‑validates selectors and session FK. |
| `PATCH` | `/applications/:id/status` | **Transactional** status/stage change: updates `lastActivityAt`, conditionally `firstResponseAt`/`closedAt`, and emits **one** `ApplicationEvent` with `metadata.previousStatus`/`previousStage`. Event `type` is derived from the new status (`offer→offer_received`, `accepted→offer_accepted`, `negotiating→offer_negotiated`, `rejected→rejected`, `withdrawn→withdrawn`, `ghosted→ghosted_marked`, else → `status_changed`). |
| `PATCH` | `/applications/:id/contacts` | Replaces the linked contact set (`set` semantics). |
| `PATCH` | `/applications/:id/archive` / `/restore` | Soft archive (`archivedAt`). |
| `POST` | `/applications/mark-stale-ghosted?days=N` | Bulk auto‑ghost (default 21). Returns `{ ghostedCount }`. |
| `DELETE` | `/applications/:id` | Hard delete. Events cascade. |

### 5.2 Application events

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/events` | Create event. Bumps `lastActivityAt` and, if `type` implies an inbound response (see §4.2) and `firstResponseAt` is empty, sets it. All in one transaction. |
| `GET` | `/applications/:applicationId/events` | Timeline (order `occurredAt desc`). |
| `GET` | `/events/:id` / `DELETE` `/events/:id` | Standard fetch / delete. |

### 5.3 Search sessions — `/api/search-sessions`

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/search-sessions` | Create. Validates `platform` against `formConfig`. `platformOther` only persists when `platform === 'other'`. `searchedAt` defaults to `now`; `jobPostedFrom` default = calendar day of `searchedAt`. |
| `GET` | `/search-sessions` | Paginated. Filters: `search` (ILIKE on queryTitle/filterDescription/notes/platformOther), `platform`, `fromDate`/`toDate`. Order `searchedAt desc`. |
| `GET` | `/search-sessions/:id` | Detail with `_count.applications`. |
| `PATCH` | `/search-sessions/:id` | Partial update. If you change `platform` to something other than `other`, clears `platformOther`. |
| `DELETE` | `/search-sessions/:id` | Delete. Applications keep `jobSearchSessionId = null`. |

### 5.4 Contacts — `/api/contacts`

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/contacts` | Create (trim `companyName`). |
| `GET` | `/contacts` | Paginated. Filters: `search` (ILIKE on name/email/title/companyName), `role`, `companyName`. Order `name asc`. |
| `GET` / `PATCH` / `DELETE` | `/contacts/:id` | Standard CRUD. |

### 5.5 Templates — `/api/templates`

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/templates` | Create. |
| `GET` | `/templates` | Paginated. Filters: `search` (ILIKE on name/subject/body), `type`, `favoritesOnly`, `language`. Order: `isFavorite desc, usageCount desc, updatedAt desc`. |
| `GET` / `PATCH` / `DELETE` | `/templates/:id` | Standard CRUD. |
| `PATCH` | `/templates/:id/favorite` | Toggle. |
| `PATCH` | `/templates/:id/used` | Increment `usageCount` and refresh `lastUsedAt` (SPA calls this on copy). |

### 5.6 Dashboard — `/api/dashboard`

Both endpoints accept `fromDate`/`toDate` (YYYY‑MM‑DD).

| Method | Path | Output |
| ------ | ---- | ------ |
| `GET` | `/dashboard` | Pipeline overview (detail below). Excludes archived. |
| `GET` | `/dashboard/search-activity` | Metrics over `JobSearchSession`. |

**`GET /dashboard`** returns:

- `kpis`: `total`, `active`, `responded`, `interviewing`, `offers`, `accepted`, `rejected`, `ghosted`, `responseRate`, `interviewRate`, `offerRate`, `acceptanceRate`, `avgDaysToFirstResponse`, `avgDaysToOffer`. An application counts as **responded** if it has `firstResponseAt` **or** `funnelIndex(status) ≥ funnelIndex(screening)` — so manual reclassifications without an event still count.
- `byStatus` / `byPosition` / `byMethod` / `byWorkMode`: `{ key, count, percentage }[]` (sorted desc by count).
- `funnel`: array following `FUNNEL_ORDER` with `count`, `conversionFromPrev`, `conversionFromTop` (1 decimal).
- `applicationsPerDay`: time series on `applicationDate`.
- `activityHeatmap`: `$queryRaw` on `application_events` grouped by `(EXTRACT(DOW), EXTRACT(HOUR))` — covers **all** logged activity, not just submissions. Honors the range.
- `methodEffectiveness`: per method → `total`, `responseRate`, `interviewRate`, `offerRate`, sorted desc by volume.
- `topCompanies`: top 10 by `applicationsCount` (key normalized `trim().toLowerCase()`), with `activeCount`.
- `upcomingFollowUps`: count of active applications with `lastActivityAt ?? applicationDate` > 7 days.

**`GET /dashboard/search-activity`** returns `totalSessions`, `linkedApplicationsCount` (sum of `_count.applications`), `byPlatform`, `byCompletion` (`active` / `complete`), `searchesPerDay`, `topQueries` (top 15), `recentSessions` (latest 20 with `applicationsCount`, `filterDescription`, `jobPostedFrom`, `resultsApproxCount`).

### 5.7 Platform settings — `/api/platform-settings`

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/platform-settings` | Returns the `default` row, **creating it** on first call (`themeId: ocean`, `appearanceMode: dark`, `formConfig: {}`). |
| `PATCH` | `/platform-settings` | Partial update. `themeId` ∈ {ocean, sky, indigo, violet, fuchsia, rose, coral, terracotta, amber, lime, emerald, slate}. `appearanceMode` ∈ {dark, night, dim, mist, soft, light}. `formConfig` validated end‑to‑end (§4.4). |

---

## 6. Frontend

### 6.1 Routes

| Route | File | What it does |
| ----- | ---- | -------------- |
| `/` | `pages/dashboard.tsx` | **Pipeline** tab (KPIs, time series, funnel, distributions, heatmap, method effectiveness, top companies, quick action `mark stale as ghosted`) and **Search activity** tab (KPIs, sessions/day, by platform, by completion, top queries, recent sessions). Date range applies to both panels (independent on the backend). |
| `/applications` | `pages/applications/list.tsx` | Filters (`search` with 300ms debounce), pagination, create modal. |
| `/applications/:id` | `pages/applications/detail.tsx` | Header with `StatusBadge` + actions (edit, archive/restore, delete with confirm), `StatusChanger`, `Timeline`, side panel with details + search session + vacancy contact. |
| `/search-sessions` | `pages/search-sessions.tsx` | Logged sessions with filters and create/edit modal. `platformOther` only when `platform === 'other'`. |
| `/templates` | `pages/templates.tsx` | Tabs by language (All / English / Spanish), filters by type and favorites. Card actions: copy (auto‑increment `usageCount`), edit, favorite toggle, delete. |
| `/settings` | `pages/settings.tsx` | Appearance + color preset (live apply); full editors for application methods / position types / employment types / search platforms (reorder · rename · hide · add custom slug · remove custom); free lists `roleTitleOptions` and `resumeVersionOptions`; overrides for `workModeLabels`. |

`AppShell` wraps all routes with `<Sidebar />` + `<main>` (max width 1400px). The sidebar is static with 5 NavLinks (Dashboard / Applications / Search sessions / Templates / Settings) plus version `v1.0.0`.

### 6.2 Theming

- 12 color presets × 6 appearance modes → 72 combinations, each with its own HSL CSS variables in `index.css` (including `--chart-1..5` and `--chart-foreground` per preset).
- `applyDocumentTheme(themeId, appearance)` clears and applies the two classes on `<html>`, persisting in `localStorage` (`applyhub-theme`, `applyhub-appearance`).
- `getAppliedThemeSnapshot()` rebuilds the snapshot from `<html>.classList`, with fallback to `localStorage` and finally `(ocean, dark)`.
- `ThemeAwareToaster` (in `main.tsx`) uses theme `'light'` only when appearance ∈ `{soft, light}`; otherwise `'dark'`.

### 6.3 Unified vocabulary

`usePlatformSettings()` exposes:

- `effective*Labels` maps (built‑in merged with `formConfig` overrides).
- Ordered lists `*SelectOptions` (order + hidden applied, custom slugs included).
- Free lists `roleTitleOptions` / `resumeVersionOptions` (with defaults from `lib/form-defaults.ts` when settings omit them).
- `updateSettings(input)` (mutation) + `isUpdating`.

Rename/add/hide/reorder in Settings reflects immediately in forms, filters, badges, and dashboard without reload.

---

## 7. Operations

### 7.1 Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

The backend container with `target: development` runs in order:

```
prisma generate
node scripts/ensure-text-selector-columns.mjs   # idempotent: converts legacy PG enums to VARCHAR without data loss
prisma db push                                  # creates tables + enums (dev only — prod uses migrate deploy)
nest start --watch
```

Default endpoints:

- Web — `http://localhost:5173`
- API — `http://localhost:3001/api`
- Swagger — `http://localhost:3001/api/docs`
- Postgres — `localhost:5432`

### 7.2 Local without Docker

```bash
# Backend
cd backend
npm install                                # postinstall runs `prisma generate`
npx prisma db push                         # or npm run prisma:db:push (includes ensure-text-selector-columns)
npm run start:dev

# Frontend
cd ../frontend
npm install
npm run dev
```

### 7.3 Configuration

Validated with Joi at boot (see `backend/src/config/validation.schema.ts`):

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `NODE_ENV` | `development` | `production` disables Swagger; in prod the image runs `prisma migrate deploy && node dist/main.js`. |
| `PORT` / `BACKEND_PORT` | `3001` | Nest reads `PORT`; compose maps `BACKEND_PORT`. |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma‑separated list. |
| `DATABASE_URL` | docker default | Postgres primary (required). |
| `DATABASE_URL_REPLICA` | `''` | If set, enables write‑mirror. |
| `DATABASE_LOGGING` | `false` | When `true`, logs Prisma `query/info/warn/error`; otherwise only `error`. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | `applyhub` / `applyhub_dev` / `applyhub` / `5432` | Compose container credentials. |
| `FRONTEND_PORT` | `5173` | Vite. |
| `VITE_API_URL` | `http://localhost:3001/api` | Base URL the SPA calls. |

### 7.4 Backend scripts (`cd backend`)

Development:

- `npm run start:dev` — Nest watch.
- `npm run build` / `npm run start:prod` — build to `dist/` and `node dist/main.js`.
- `npm run lint` / `npm run format`.

Prisma:

- `npm run prisma:generate` — regenerate client.
- `npm run prisma:db:push` — `ensure-text-selector-columns` + `prisma db push` (dev, no versioned migration).
- `npm run prisma:migrate:dev` / `prisma:migrate:deploy` — versioned migrations (deploy is the production path).
- `npm run prisma:studio` — Prisma Studio. `prisma-studio-local.mjs` rewrites host `postgres → 127.0.0.1` when running on the host (not in the container).
- `npm run seed` — seeds the 12 EN/ES templates from `seed.ts`. Idempotent: if `templates` is not empty, **skip**.

Replica (they target `DATABASE_URL_REPLICA` via `run-on-replica.mjs`):

- `npm run prisma:db:push:replica`, `prisma:studio:replica`, `seed:replica`.

Ops on primary ↔ replica:

- `npm run db:status` — JSON with `counts` per model (`contacts`, `jobSearchSessions`, `jobApplications`, `applicationEvents`, `templates`, `platformSettings`, `applicationContactsPivot`) and `MAX(updatedAt)` per model on both sides, plus `sameCounts` boolean.
- `npm run db:sync:incremental:local-to-replica` / `replica-to-local` — FK-safe order (`contact → jobSearchSession → jobApplication → applicationEvent → template → platformSettings`), paginated by `id ASC` (batch 200), upsert only if `source.updatedAt > target.updatedAt`. Also syncs `_ApplicationContacts` with raw SQL (`INSERT ... ON CONFLICT DO NOTHING`). Append `-- --prune` to also delete target rows missing from source (children pruned first).
- `npm run db:sync:local-to-replica` / `replica-to-local` — full snapshot via `pg_dump --no-owner --no-acl --clean --if-exists | psql --set=ON_ERROR_STOP=1` inside a one‑off `postgres:18-alpine` (no `pg_dump` needed on the host). Assumes network `apply-hub_default` (override with `DOCKER_NETWORK`).

Tests (Jest):

- `npm test` — runs all unit suites (`test/prisma`, `test/modules`, `test/scripts`).
- `npm run test:watch` / `npm run test:cov` — watch mode and coverage report.
- The `prisma/` suite locks the write-mirror contract: every mutating action (`create`/`createMany`/`update`/`updateMany`/`upsert`/`delete`/`deleteMany`) is replicated for all 6 models, reads are never replicated, the queue is serial, args are snapshotted, FK errors (`P2003`) retry with backoff, and replica failures never break the primary path.
- The `modules/` suites assert that every service goes through `PrismaService` (so the replication middleware fires) and that transactional flows (`ApplicationsService.create`, `changeStatus`, `markStaleAsGhosted`, `ApplicationEventsService.create`) emit both the row write and the timeline event in a single `$transaction` callback.
- The `scripts/` suites lock the model lists in `db-sync-incremental.mjs` and `db-status.mjs` to the schema (forces a test failure if a future model is added without updating either script).

---

## 8. Replica — operational guide

Reads always go to the primary. The replica receives writes asynchronously via Prisma middleware and is used for recovery or mirror reads. Schema changes must be applied to **both** databases.

### 8.1 Enable

1. Obtain the **external** URL of the secondary database (`?sslmode=require` for managed providers).
2. `DATABASE_URL_REPLICA=<url>` in `.env`.
3. Apply schema once:
   ```bash
   cd backend
   npm run prisma:db:push:replica
   ```
4. Restart the backend. Look for `Prisma connected (replica)` in logs (or a warning if connection failed — the app still runs against the primary).

### 8.2 Day to day

```bash
npm run db:status                                  # parity report
npm run db:sync:incremental:local-to-replica       # forward fix (most common)
npm run db:sync:incremental:replica-to-local       # backward fix (recovery)
```

For severe drift or restore, use the snapshot variants (`db:sync:*`). To "promote" the replica during a primary outage, swap `DATABASE_URL` to the replica URL and restart.

### 8.3 Caveats

- **Eventually consistent**. If the replica is down, those writes stay pending manual reconciliation with the scripts.
- **No schema replication**. Migrations against the primary do not touch the replica — run the equivalents with `:replica`.
- **Single‑operator assumption**. No auth; security model is the network perimeter only.

---

## 9. Production

- Backend: `Dockerfile` target `production` runs `prisma migrate deploy && node dist/main.js` with prod‑only deps (`npm ci --omit=dev`). Use versioned migrations (`npm run prisma:migrate:dev` during development to create `migrations/` files).
- Frontend: `Dockerfile` target `production` builds with Vite and serves `dist/` from `nginx:alpine` with `nginx.conf` SPA fallback (`try_files $uri /index.html`).
- Swagger is **disabled** automatically when `NODE_ENV === 'production'`.
- Set `CORS_ORIGIN` to the public SPA domain (comma‑separated if several) and `VITE_API_URL` to the public API domain **before** `vite build`.
