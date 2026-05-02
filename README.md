# ApplyHub

Personal full‑stack hub to track every job application as a first‑class entity, with status, stage, timeline, contacts, the search session that produced it, and the analytics derived from all of it.

---

## Why it exists

Job searching produces a lot of short‑lived context: an open posting tab, a recruiter message, a follow‑up TODO, a resume version, the search filters that surfaced the role. ApplyHub captures that context as data so the lifecycle of each opportunity — and the patterns across all of them — stay queryable from one place. Authentication is intentionally disabled: ApplyHub is meant to run as a single‑operator tool behind a network boundary you control.

## Stack

- **API**: NestJS 10, Prisma 5, PostgreSQL 16, class‑validator, class‑transformer, Swagger.
- **Web**: React 18 + Vite 6, TypeScript 5, TanStack Query 5, React Hook Form + Zod, Tailwind CSS 3, Recharts 2, Sonner toasts, Lucide icons.
- **Infra**: Docker Compose for Postgres + API + Web; multi‑stage Dockerfiles with `development` and `production` targets (Nest in watch mode for dev, `nginx:alpine` serving the SPA for prod).

---

## Architecture

The codebase is split in two deployable units (`backend/`, `frontend/`) plus shared docker scaffolding. Each backend module follows the same shape:

```
modules/<feature>/
├── <feature>.controller.ts   HTTP surface (validation only)
├── <feature>.service.ts      use cases, persistence, transactions
├── <feature>.module.ts       wiring + cross-module imports
├── domain/                   enums, status resolvers, helpers (pure)
└── dto/                      class-validator request/query DTOs
```

Cross‑cutting concerns live at the top:

- `src/main.ts` — bootstraps Nest with global `/api` prefix, CORS allowlist (`CORS_ORIGIN` accepts comma‑separated origins), `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`, implicit conversion) and a global `HttpExceptionFilter` that returns `{ statusCode, message, error, path, timestamp }` for every error and logs 5xx with stack.
- `src/config/` — typed `AppConfig` loaded by `ConfigService` and validated against a Joi schema (`abortEarly`).
- `src/common/` — shared `PaginationDto` (`page`, `limit` with `1..200` cap and a `PaginatedResult<T>` envelope) and the global exception filter.
- `src/prisma/` — `PrismaService` extends `PrismaClient`, owns the optional **replica** middleware (see below) and connects on `OnModuleInit`. Module is `@Global()` so every feature module gets it without re‑importing.

Feature modules read configuration only through services they depend on; they never touch `process.env` or instantiate Prisma directly. Status transitions, default stage resolution and "first response" detection live in `applications/domain/status-resolver.service.ts`, kept out of controllers and dashboard code.

### Write‑mirror replica

`PrismaService` installs a Prisma middleware when `DATABASE_URL_REPLICA` is set:

1. Pre‑generates UUIDs for `create` / `createMany` so primary and replica end up with the same primary keys.
2. After the primary write succeeds, snapshots the params (deep clone) and enqueues the same operation against the replica through a serial promise queue (preserves write order, avoids FK race conditions).
3. Retries up to four times with backoff for FK errors (`P2003`) since replicated rows may temporarily race against parents.
4. Failures on the replica are logged and discarded — the primary is the source of truth and `npm run db:status` / `db:sync:*` reconcile drift.

Read paths never hit the replica.

### Frontend architecture

```
frontend/src/
├── main.tsx                  React root, query client + theme-aware Toaster
├── App.tsx                   route table
├── api/                      typed axios clients (one file per resource)
├── components/
│   ├── applications/         feature components (form, filters, row, timeline, status changer)
│   ├── dashboard/            chart primitives (heatmap, funnel, distribution, time series, KPI)
│   ├── layout/               app shell, sidebar, page header
│   ├── status/               status badge
│   └── ui/                   primitives (button, card, modal, select, ...)
├── context/                  PlatformSettingsProvider (single source for vocabulary + theme)
├── hooks/                    TanStack Query hooks per resource
├── lib/                      axios + interceptors, query client, theme helpers, formatters
├── pages/                    routed views
└── types/                    enums, labels, models, platform-settings DTOs
```

- **Single React Query client** (`lib/query-client.ts`) with `staleTime: 30s`, no retry on mutations, no refetch‑on‑focus.
- **Axios interceptor** (`lib/api.ts`) maps backend error envelopes to a typed `ApiError` and emits a `sonner` toast with a contextual title (Connection / Server / Invalid request / Forbidden / Not found).
- **Theming** is owned by `PlatformSettingsProvider`. The HTML `<html>` class composes `{appearance} theme-preset-{id}` (e.g. `dim theme-preset-emerald`); CSS variables in `index.css` define every appearance × preset combination. The toaster reads `appearanceMode` and switches its sonner theme accordingly.
- **Forms**: `react-hook-form` + `zodResolver`. The application form binds vocabulary‑driven selectors (method, position, employment, role title, resume version, search platform) to options coming from `usePlatformSettings()`, so renaming or adding an entry in Settings instantly propagates to forms, filters and detail views.

---

## Domain model

Defined in `backend/prisma/schema.prisma`. Six aggregates, each with explicit indexes and `@@map`s.

| Aggregate            | Purpose | Notable fields |
| -------------------- | ------- | -------------- |
| `JobApplication`     | One opportunity. Owns status, stage, priority, salary band, denormalized vacancy contact, optional link to a search session. | `position`, `applicationMethod`, `employmentType`, `platform` are **strings** (built‑in IDs + custom slugs from settings); `postingLanguage` enum (`en` / `es`); `resumeVersion`; `firstResponseAt`, `lastActivityAt`, `closedAt`, `archivedAt` derived by the service layer. |
| `JobSearchSession`   | A logged search (platform, query, filters, posted‑from window). Aggregates the applications produced from it. | `platform` (string + custom slugs), `platformOther`, `queryTitle`, `filterDescription`, `jobPostedFrom`, `searchedAt`, `resultsApproxCount`, `isComplete`, `searchUrl`. |
| `ApplicationEvent`   | Append‑only audit of every status/stage change, message, interview, note. Drives the timeline view. | `type`, `newStatus`, `newStage`, `channel`, `occurredAt`, JSON `metadata` (carries `previousStatus`/`previousStage` for transitions). |
| `Contact`            | Reusable people (recruiters, hiring managers, referrals) attachable to many applications via the implicit `_ApplicationContacts` pivot. | `role`, optional email/phone/LinkedIn, `companyName`. |
| `Template`           | Reusable copy (cover letters, follow‑ups, outreach) with usage stats and favorites. | `type`, `language`, `tags`, `usageCount`, `isFavorite`, `lastUsedAt`. |
| `PlatformSettings`   | Single‑row configuration: appearance, color preset, custom selector vocabularies. | `themeId`, `appearanceMode` (`dark`/`dim`/`light`), `formConfig` JSON (see below). |

### Status pipeline

```
applied → acknowledged → screening → assessment → interview → offer → negotiating → accepted
                                                         ↘
                                               rejected | withdrawn | ghosted | on_hold
```

`StatusResolverService`:

- **`defaultStageFor(status)`** — picks the canonical stage when the client doesn't specify one (e.g. `screening → recruiter_screen`, `interview → tech_interview_1`).
- **`isFirstResponseTransition(from, to)`** — `true` when leaving `applied` to anything other than `applied`/`ghosted`. The first such transition stamps `firstResponseAt`.
- **`isClosingTransition(to)`** — `true` for `accepted` / `rejected` / `withdrawn` / `ghosted`. Stamps `closedAt`. Re‑opening to a non‑terminal status clears it.
- `ACTIVE_STATUSES`, `TERMINAL_STATUSES` and `FUNNEL_ORDER` are exported from `application.enums.ts` and consumed by both the applications service and the dashboard.

### Auto‑ghost

`POST /applications/mark-stale-ghosted` walks `applied` / `acknowledged` rows whose `lastActivityAt` (or `applicationDate` fallback) is older than `daysWithoutActivity` (default 21, override with `?days=`) and replays `changeStatus` on each, so the timeline event is emitted normally.

### Configurable vocabularies

`PlatformSettings.formConfig` is a JSON document validated by `assertValidFormConfig`:

- **Custom slug sets** for `applicationMethod`, `position`, `employmentType` and `searchPlatform` (`/^[a-z][a-z0-9_]{0,47}$/`, no collision with built‑in IDs, no duplicates).
- **Order arrays** are required to be a full permutation of the universe (`builtin ∪ custom`); mismatched length, unknown entries or duplicates are rejected.
- **Hidden arrays** must be subsets; **labels** keys must belong to the universe.
- **Free lists**: `roleTitleOptions` (≤80) and `resumeVersionOptions` (≤40).
- `workModeLabels` keys are validated against the `WorkMode` enum (no custom slugs there — work mode stays a strict enum).

`ApplicationsService.assertApplicationSelectors` and `SearchSessionsService.assertSearchPlatform` re‑validate every write against the live `formConfig`, so removing a custom slug doesn't allow new rows to use it (existing rows keep the value).

---

## HTTP API

Global prefix: **`/api`**. OpenAPI / Swagger is mounted at `/api/docs` outside production. All list endpoints inherit `PaginationDto` (`page`, `limit`).

### Applications — `ApplicationsController`

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/applications` | Create. Validates selectors against `PlatformSettings`, defaults dates to today, defaults `stage` from `StatusResolverService`. Always emits an `application_submitted` event in the same transaction. |
| `GET` | `/applications` | Paginated list. Filters: `search` (role/company/notes/location, ILIKE), `status[]`, `stage[]`, `position[]`, `method[]`, `workMode[]`, `priority[]`, `companyName`, `fromDate`, `toDate`, `tags[]`, `onlyActive`, `includeArchived`. Sort: `applicationDate`/`createdAt`/`updatedAt`/`status`/`priority`/`lastActivityAt`, `asc`/`desc`. |
| `GET` | `/applications/:id` | Single application with `contacts` and a slim `jobSearchSession` projection. |
| `PATCH` | `/applications/:id` | Partial update (no status/stage; uses dedicated endpoint). Re‑validates selector slugs and search‑session FK. |
| `PATCH` | `/applications/:id/status` | Status / stage change inside a transaction; updates `lastActivityAt`, conditionally sets `firstResponseAt` and `closedAt`, and writes one `ApplicationEvent` with `previousStatus`/`previousStage` in metadata. |
| `PATCH` | `/applications/:id/contacts` | Replace the linked contacts (set‑semantics on `_ApplicationContacts`). |
| `PATCH` | `/applications/:id/archive` / `/restore` | Soft‑archive via `archivedAt`. List view excludes archived unless `includeArchived=true`. |
| `POST` | `/applications/mark-stale-ghosted?days=N` | Bulk auto‑ghost (replays per‑row `changeStatus`). Returns `{ ghostedCount }`. |
| `DELETE` | `/applications/:id` | Hard delete. 404 mapped from Prisma `P2025`. |

### Application events — `ApplicationEventsController`

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/events` | Create event. Bumps `lastActivityAt` and, when `type` implies an inbound response (`MESSAGE_RECEIVED`, `EMAIL_RECEIVED`, `INTERVIEW_SCHEDULED`, `ASSESSMENT_ASSIGNED`, `FEEDBACK_RECEIVED`, `OFFER_RECEIVED`), stamps `firstResponseAt` if missing. |
| `GET` | `/applications/:applicationId/events` | Timeline for one application, ordered by `occurredAt desc`. |
| `GET` | `/events/:id` / `DELETE` `/events/:id` | Standard fetch / delete. |

### Search sessions — `SearchSessionsController`

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` `/search-sessions` | Create. `platform` validated against `formConfig`; `platformOther` only kept when `platform === 'other'`. `jobPostedFrom` defaults to the calendar day of `searchedAt`. |
| `GET` `/search-sessions` | Paginated. Filters: `search` (query/filters/notes/platformOther), `platform`, `fromDate`, `toDate`. |
| `GET` `/search-sessions/:id` | Single session including `_count.applications`. |
| `PATCH` / `DELETE` `/search-sessions/:id` | Partial update / delete. Deleting unlinks applications via `onDelete: SetNull`. |

### Contacts — `ContactsController`

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` `/contacts` | Create. |
| `GET` `/contacts` | Paginated. Filters: `search` (name/email/title/company), `role`, `companyName`. Ordered by `name asc`. |
| `GET` / `PATCH` / `DELETE` `/contacts/:id` | Standard CRUD. |

### Templates — `TemplatesController`

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` `/templates` | Create. |
| `GET` `/templates` | Paginated. Filters: `search` (name/subject/body), `type`, `favoritesOnly`, `language`. Ordered by `isFavorite desc, usageCount desc, updatedAt desc`. |
| `GET` / `PATCH` / `DELETE` `/templates/:id` | Standard CRUD. |
| `PATCH` `/templates/:id/favorite` | Toggle `isFavorite`. |
| `PATCH` `/templates/:id/used` | Increment `usageCount` and refresh `lastUsedAt` (called by the SPA on copy). |

### Dashboard — `DashboardController`

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` `/dashboard` | Pipeline overview. |
| `GET` `/dashboard/search-activity` | Search‑sessions overview. |

Both accept `fromDate` / `toDate`. The pipeline overview returns:

- `kpis` — `total`, `active`, `responded`, `interviewing`, `offers`, `accepted`, `rejected`, `ghosted`, `responseRate`, `interviewRate`, `offerRate`, `acceptanceRate`, `avgDaysToFirstResponse`, `avgDaysToOffer`. "Responded" is computed via `firstResponseAt` **or** funnel index `≥ screening`, so manual status moves still count.
- `byStatus`, `byPosition`, `byMethod`, `byWorkMode` — `{ key, count, percentage }[]` sorted by count.
- `funnel` — array following `FUNNEL_ORDER` with `count`, `conversionFromPrev` and `conversionFromTop` (rounded to one decimal).
- `applicationsPerDay` — daily time series of `applicationDate`.
- `activityHeatmap` — raw SQL (`$queryRaw`) against `application_events` grouped by `(EXTRACT(DOW), EXTRACT(HOUR))` so it covers every recorded movement, not just submissions. Honors the date window.
- `methodEffectiveness` — per‑method `total`, `responseRate`, `interviewRate`, `offerRate`, sorted by volume.
- `topCompanies` — top 10 by application count, with `activeCount`.
- `upcomingFollowUps` — active applications whose `lastActivityAt` (or `applicationDate`) is more than 7 days old.

Search activity returns `totalSessions`, `linkedApplicationsCount`, `byPlatform`, `byCompletion` (`active` / `complete`), `searchesPerDay`, `topQueries` (top 15) and `recentSessions` (latest 20 with `applicationsCount`).

### Platform settings — `PlatformSettingsController`

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` `/platform-settings` | Returns the single `default` row, creating it on first call (`themeId: ocean`, `appearanceMode: dark`, empty `formConfig`). |
| `PATCH` `/platform-settings` | Updates `themeId` (`ocean` / `violet` / `emerald` / `rose` / `amber` / `slate`), `appearanceMode` (`dark` / `dim` / `light`) and/or `formConfig` (validated end‑to‑end). |

---

## Frontend pages

| Route | File | Notes |
| ----- | ---- | ----- |
| `/` | `pages/dashboard.tsx` | Tabbed view: **Pipeline** (KPIs, time series, funnel, distributions, activity heatmap, method effectiveness, top companies, "mark stale as ghosted" quick action) and **Search activity** (KPIs, sessions per day, by platform / completion, top queries, recent sessions). Date range applies to both panels. |
| `/applications` | `pages/applications/list.tsx` | Filters bar (debounced search), pagination, modal create. |
| `/applications/:id` | `pages/applications/detail.tsx` | Header with status badge + actions (edit, archive/restore, delete), `StatusChanger`, `Timeline`, side panel with details (position, priority, employment, salary, search session, resume, posting language, derived dates). |
| `/search-sessions` | `pages/search-sessions.tsx` | Logged searches with filters, create/edit modal. Custom platform field appears only when `platform === 'other'`. |
| `/templates` | `pages/templates.tsx` | Tabs by language (All / English / Spanish), filters by type and favorites. Card actions: copy (auto‑increments `usageCount`), edit, favorite toggle, delete. |
| `/settings` | `pages/settings.tsx` | Appearance + color preset; full editors for application methods, position types, employment types, search platforms (reorder / rename / hide / add custom slug / remove custom); free lists for role titles and resume versions; work mode label overrides. |

---

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

The backend container generates the Prisma client, runs `prisma db push` (creates tables + enums) and starts Nest in watch mode. Default endpoints:

- Web — `http://localhost:5173`
- API — `http://localhost:3001/api`
- Swagger — `http://localhost:3001/api/docs`
- Postgres — `localhost:5432`

### Local development without Docker

```bash
# Backend
cd backend
npm install
npx prisma generate
npx prisma db push
npm run start:dev

# Frontend
cd frontend
npm install
npm run dev
```

### Configuration

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `NODE_ENV` | `development` | `development` enables Swagger; `production` runs `prisma migrate deploy` and `node dist/main.js`. |
| `PORT` / `BACKEND_PORT` | `3001` | API port (Nest reads `PORT`; compose maps `BACKEND_PORT`). |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma‑separated allowlist. |
| `DATABASE_URL` | docker default | Primary Postgres (required). |
| `DATABASE_URL_REPLICA` | empty | Optional secondary; when set, write‑mirror is enabled. |
| `DATABASE_LOGGING` | `false` | Enables Prisma `query`/`info`/`warn`/`error` logs. |
| `FRONTEND_PORT` | `5173` | Vite dev port. |
| `VITE_API_URL` | `http://localhost:3001/api` | Base URL the SPA calls. |

### Backend scripts (`cd backend`)

- `npm run start:dev` — Nest in watch mode.
- `npm run build` / `npm run start:prod` — production build and run.
- `npm run prisma:generate` — regenerate the typed client.
- `npm run prisma:db:push` — apply schema without a migration (dev).
- `npm run prisma:migrate:dev` / `prisma:migrate:deploy` — versioned migrations.
- `npm run prisma:studio` — Prisma Studio against the primary.
- `npm run seed` — seed default templates (12 entries, 6 EN / 6 ES). Idempotent: skipped when the table is non‑empty.
- `npm run db:status` — emits a JSON report comparing row counts and `MAX(updatedAt)` per model between primary and replica.
- `npm run db:sync:incremental:local-to-replica` / `replica-to-local` — cursor‑paginated upsert by `id`, only when source `updatedAt` is newer; also reconciles the implicit pivot `_ApplicationContacts`.
- `npm run db:sync:local-to-replica` / `replica-to-local` — full snapshot via `pg_dump | psql` inside a one‑off `postgres:18-alpine` container (no host Postgres tooling required).
- `npm run prisma:db:push:replica` / `prisma:studio:replica` / `seed:replica` — replica‑targeted variants.

---

## Replica — operational guide

Reads always go to the primary. The replica receives writes asynchronously through the Prisma middleware and exists for recovery. Schema changes must be applied to **both** databases.

### Enable

1. Get the **external** connection string of the secondary database (`?sslmode=require` for managed providers).
2. Set `DATABASE_URL_REPLICA` in `.env`.
3. Apply the schema once:
   ```bash
   cd backend
   npm run prisma:db:push:replica
   ```
4. Restart the backend; you should see `Prisma connected (replica)` in the logs (or a warning if it can't reach it — the app keeps running against the primary).

### Day‑to‑day

```bash
npm run db:status                                  # parity report
npm run db:sync:incremental:local-to-replica       # forward fix
npm run db:sync:incremental:replica-to-local       # backward fix
```

For heavy drift or recovery use the snapshot variants. To switch the app to the replica during a primary outage, swap `DATABASE_URL` to the replica URL and restart.

### Caveats

- **Eventually consistent.** If the replica is briefly unreachable, those writes need a manual reconciliation via the sync scripts.
- **No schema replication.** Migrations against the primary do not touch the replica.
- **Single‑operator assumption.** Authentication is intentionally disabled. Run behind a network boundary you control.

---

## Repository layout

```
apply-hub/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma                # source of truth for the database
│   ├── scripts/                         # db-status, db-sync, db-sync-incremental, run-on-replica, prisma-studio-local
│   └── src/
│       ├── main.ts                      # bootstrap (CORS, ValidationPipe, exception filter, Swagger)
│       ├── app.module.ts                # ConfigModule (Joi) + Prisma + feature modules
│       ├── common/
│       │   ├── dto/pagination.dto.ts    # PaginationDto + PaginatedResult<T>
│       │   └── filters/http-exception.filter.ts
│       ├── config/                      # configuration() + Joi schema
│       ├── prisma/                      # @Global PrismaService + replica middleware
│       ├── database/seed.ts             # default templates (EN + ES)
│       └── modules/
│           ├── applications/            # controller/service/dto/domain (status resolver lives here)
│           ├── application-events/
│           ├── contacts/
│           ├── dashboard/               # service + types (KPIs, distributions, funnel, heatmap)
│           ├── platform-settings/       # single-row settings + formConfig validators
│           ├── search-sessions/
│           └── templates/
├── frontend/
│   └── src/
│       ├── main.tsx, App.tsx
│       ├── api/                         # one axios client per resource (typed responses)
│       ├── components/                  # ui primitives + feature components + dashboard charts
│       ├── context/                     # PlatformSettingsProvider (theme + vocabulary)
│       ├── hooks/                       # TanStack Query hooks per resource
│       ├── lib/                         # axios, query client, theme helpers, formatters, defaults
│       ├── pages/                       # dashboard, applications (list/detail), search-sessions, templates, settings
│       └── types/                       # shared enums, labels, models, platform-settings DTOs
├── docker-compose.yml                   # postgres + backend + frontend
└── .env.example
```
