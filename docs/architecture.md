# Architecture

> Single-operator, full-stack TypeScript application. Decoupled SPA + REST API
> + PostgreSQL primary, with an **optional asynchronous write-mirror** to a
> secondary database used as a live backup or read-only replica for recovery.

---

## 1. Runtime topology

```
                    ┌───────────────────────────────┐
                    │   React 18 SPA (Vite 6)        │
                    │   served by nginx in prod      │
                    │   port 5173 (dev) / 80 (prod)  │
                    └──────────────┬─────────────────┘
                                   │  HTTP/JSON  (VITE_API_URL)
                                   │
                    ┌──────────────▼─────────────────┐
                    │   NestJS 10 API                │
                    │   prefix: /api                 │
                    │   port 3001                    │
                    │   Swagger at /api/docs (dev)   │
                    └──────┬─────────────────┬───────┘
                           │ Prisma 5        │ Prisma 5 ($use)
                           │ (reads/writes)  │ (writes mirror)
                           ▼                 ▼
              ┌───────────────────┐  ┌───────────────────┐
              │ PostgreSQL 16     │  │ PostgreSQL 16     │
              │ PRIMARY            │  │ REPLICA (optional)│
              │ docker / managed   │  │ managed / external│
              └───────────────────┘  └───────────────────┘
```

Three Docker Compose services in development:

| Service | Image / build | Container | Public port |
| ------- | ------------- | --------- | ----------- |
| `postgres` | `postgres:16-alpine` | `applyhub-postgres` | `${POSTGRES_PORT:-5432}` |
| `backend` | `./backend` (target `development`) | `applyhub-backend` | `${BACKEND_PORT:-3001}` |
| `frontend` | `./frontend` (target `development`) | `applyhub-frontend` | `${FRONTEND_PORT:-5173}` |

In production, the same Dockerfiles flip target:

- `backend` → `production` runs `prisma migrate deploy && node dist/main.js`
  with `npm ci --omit=dev`.
- `frontend` → `production` builds with Vite and serves `dist/` from
  `nginx:alpine` with the SPA fallback (`try_files $uri /index.html`).

---

## 2. Backend bootstrap (`src/main.ts`)

`bootstrap()` does exactly six things, in order:

1. `NestFactory.create(AppModule, { bufferLogs: true })`.
2. `app.setGlobalPrefix('api')` → every route is mounted under `/api`.
3. `app.enableCors({ origin: corsOrigin.split(',').map(o => o.trim()), credentials: true })`
   so `CORS_ORIGIN` accepts a comma-separated list.
4. Global `ValidationPipe`:
   ```ts
   {
     whitelist: true,
     forbidNonWhitelisted: true,
     transform: true,
     transformOptions: { enableImplicitConversion: true },
   }
   ```
   - `whitelist` strips unknown DTO properties.
   - `forbidNonWhitelisted` rejects requests that include them (`400`).
   - `transform` + `enableImplicitConversion` is what makes `?page=2&limit=50`
     arrive as `number` in `PaginationDto`.
5. Global `HttpExceptionFilter` returning the uniform error envelope:
   ```json
   {
     "statusCode": 400,
     "message": ["companyName must be a string"],
     "error": "BadRequestException",
     "path": "/api/applications",
     "timestamp": "2026-05-06T14:00:00.000Z"
   }
   ```
   `message` may be `string | string[]`. Stack traces are logged only when
   `status >= 500`.
6. Swagger at `/api/docs` (skipped when `NODE_ENV === 'production'`).

`AppModule` wires `ConfigModule.forRoot({ isGlobal: true, load: [configuration], validationSchema, validationOptions: { abortEarly: true } })`
and seven feature modules + the global `PrismaModule`.

---

## 3. Cross-cutting building blocks

### 3.1 `PaginationDto` — base for all list queries

```ts
export class PaginationDto {
  @IsInt() @Min(1)            page: number = 1;
  @IsInt() @Min(1) @Max(200)  limit: number = 25;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}
```

Every `Query<Resource>Dto` extends `PaginationDto`. Lists never return raw
arrays; they always return a `PaginatedResult<T>` envelope. `totalPages` is
`Math.max(1, Math.ceil(total / limit))`.

### 3.2 `HttpExceptionFilter`

- Inherits from Nest's `ExceptionFilter`.
- Maps `HttpException` and arbitrary errors to the JSON envelope above.
- Sets `error` to the original error class name (e.g.
  `BadRequestException`, `NotFoundException`, `Error`).
- Logs with stack trace **only** for `status >= 500`.

### 3.3 `PrismaService` (`@Global() PrismaModule`)

- Extends `PrismaClient`.
- Reads `database.logging` from `ConfigService` and toggles between
  `['query','info','warn','error']` and `['error']`.
- Reads `database.replicaUrl`. If set, on `onModuleInit` it tries to
  `$connect()` a separate `PrismaClient` against the replica and installs
  the replication middleware via `this.$use(...)`.
- If the replica fails to connect at startup, the failure is logged at `warn`
  level and the app keeps running against the primary (graceful degradation).
- On `onModuleDestroy` it drains the replication queue, then disconnects
  primary and replica.

The replication middleware is the **only** path that mutates the replica at
runtime. See [`database.md`](./database.md#3-write-mirror-replica) for the
full state machine.

### 3.4 Configuration (`config/configuration.ts` + `validation.schema.ts`)

Strictly typed `AppConfig`:

```ts
{
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  corsOrigin: string;
  database: { url: string; replicaUrl: string | null; logging: boolean };
}
```

Joi validates the raw `process.env` at boot (`abortEarly: true`):

- `NODE_ENV` ∈ `{development, production, test}`, default `development`.
- `PORT` defaults to `3001`.
- `CORS_ORIGIN` defaults to `http://localhost:5173`.
- `DATABASE_URL` is required and must be a valid `postgresql://` URI.
- `DATABASE_URL_REPLICA` is optional (empty string allowed).
- `DATABASE_LOGGING` is a boolean, default `false`.

Services read configuration **only** through `ConfigService` — never
`process.env` directly. This is the contract enforced by code review and
implicitly verified by all module tests (mocking `ConfigService` instead of
patching `process.env`).

---

## 4. Module map

`AppModule` imports the following feature modules. All seven controllers
inherit the `/api` prefix.

| Module | Mount | Imports | Provides |
| ------ | ----- | ------- | -------- |
| `ApplicationsModule` | `/api/applications` | `PlatformSettingsModule` | `ApplicationsService`, `StatusResolverService` |
| `ApplicationEventsModule` | `/api/events` + `/api/applications/:id/events` | — | `ApplicationEventsService` |
| `ContactsModule` | `/api/contacts` | — | `ContactsService` |
| `SearchSessionsModule` | `/api/search-sessions` | `PlatformSettingsModule` | `SearchSessionsService` |
| `TemplatesModule` | `/api/templates` | — | `TemplatesService` |
| `DashboardModule` | `/api/dashboard` | — | `DashboardService` |
| `PlatformSettingsModule` | `/api/platform-settings` | — | `PlatformSettingsService` |

Two modules import `PlatformSettingsModule` because they re-validate selector
fields (`applicationMethod`, `position`, `employmentType`, `platform`)
against the configured vocabulary on **every write**. See
[`backend.md`](./backend.md#configurable-vocabularies).

`PrismaModule` is `@Global()`, so it does not need to appear in feature
module imports.

### 4.1 Canonical module shape

```
modules/<feature>/
├── <feature>.controller.ts   # HTTP surface — binding + validation only
├── <feature>.service.ts      # use cases, persistence, transactions
├── <feature>.module.ts       # wiring + cross imports
├── domain/                   # enums, pure helpers, resolvers (no Nest deps)
└── dto/                      # class-validator DTOs (request + query)
```

Rules the codebase follows (and code review enforces):

- Services read configuration **only** via `ConfigService`.
- Services use Prisma **only** via `PrismaService` — `PrismaClient` is never
  instantiated inside a feature module. This is what guarantees the write-
  mirror middleware fires (the replication tests assert this).
- Status transition logic lives in
  `applications/domain/status-resolver.service.ts` and is reused from the
  dashboard.
- Vocabulary validation lives in
  `platform-settings/domain/form-config.helpers.ts` and applies both when
  saving `PlatformSettings` and when creating/updating
  `JobApplication`/`JobSearchSession`.

---

## 5. Frontend topology

```
src/
├── main.tsx              QueryClient + BrowserRouter + PlatformSettingsProvider + ThemeAwareToaster
├── App.tsx               <Routes> table inside <AppShell />
├── api/                  1 typed axios client per resource
├── components/           ui primitives, applications, dashboard, layout, status
├── context/              PlatformSettingsProvider (theme + vocabulary)
├── hooks/                1 Query/Mutation hooks file per resource
├── lib/                  api · query-client · apply-theme · theme-presets · chart-palette · cn · format · form-*
├── pages/                dashboard · applications · search-sessions · templates · settings
└── types/                enums · labels · models · platform-settings
```

Pillars:

- **One `QueryClient`** (`lib/query-client.ts`):
  ```ts
  defaultOptions: {
    queries:   { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
    mutations: { retry: 0 },
  }
  ```
- **Axios with a response interceptor** (`lib/api.ts`): maps the backend error
  envelope to a typed `ApiError` and shows a contextual `sonner` toast:
  - no response → `Connection error`.
  - `>= 500` → `Server error`.
  - `400` → `Invalid request`, `403` → `Forbidden`, `404` → `Not found`.
  - other 4xx → `Request failed`.
  When `message` is `string[]` the description joins with ` • `.
- **Context-driven theming**. `<html>` carries two classes:
  `${appearanceMode} theme-preset-${themeId}` (e.g. `dim theme-preset-emerald`).
  `applyDocumentTheme` clears old ones and persists the choice in `localStorage`
  (`applyhub-theme`, `applyhub-appearance`). On boot, `PlatformSettingsProvider`
  re-applies whatever the backend stored, so the theme survives reloads
  even if `localStorage` is cleared.
- **Vocabulary-aware selectors**. `usePlatformSettings()` materializes
  `methodSelectOptions`, `positionSelectOptions`, `employmentSelectOptions`,
  `searchPlatformSelectOptions`, `workModeSelectOptions`, `roleTitleOptions`,
  `resumeVersionOptions`. Renaming, adding, hiding or reordering in Settings
  propagates **immediately** to forms, filters and detail views.
- **Forms**: React Hook Form + Zod (`@hookform/resolvers/zod`). The
  `'Unspecified'` sentinel on optional selects maps to `null` before submit so
  strict backend validators (URL/email) are not broken.

See [`frontend.md`](./frontend.md) for component-level detail.

---

## 6. Request lifecycle

A typical write — say `POST /api/applications` — flows like this:

```
React form
   │  (hook form + zod)
   ▼
applicationsApi.create()             frontend/src/api/applications.ts
   │  axios POST /api/applications
   ▼
HttpExceptionFilter ◄─┐              backend/src/common/filters/...
   │                  │ on error
ValidationPipe        │              global pipe in main.ts
   │ DTO validated    │
   ▼                  │
ApplicationsController.create()      backend/src/modules/applications/...
   │
   ▼
ApplicationsService.create()         (uses StatusResolverService + PlatformSettingsService)
   │
   ▼
prisma.$transaction(async tx => {
   │  tx.jobApplication.create(...)  ← write 1 (replicated by middleware)
   │  tx.applicationEvent.create(...)← write 2 (replicated by middleware)
   │  return created
})
   │
   ▼
ReplicationMiddleware                backend/src/prisma/replication.middleware.ts
   ├─ preGenerateIds (UUIDs for create / createMany)
   ├─ await next()                  ← actual primary write
   └─ enqueue snapshot for replica  ← async, serial, retried on FK errors
   │
   ▼
JobApplication row + ApplicationEvent row in Postgres
   │
   ▼ React Query invalidation
List, dashboard, detail and timeline queries are refetched.
```

Every transactional flow that involves multiple writes (`ApplicationsService.create`,
`ApplicationsService.changeStatus`, `ApplicationsService.markStaleAsGhosted`,
`ApplicationEventsService.create`) goes through `prisma.$transaction(...)` so
the row write and the timeline event are atomic on the primary. Each individual
Prisma call inside the transaction still flows through the middleware, so the
replica receives the same writes — just asynchronously.

---

## 7. Status pipeline (domain core)

```
applied → acknowledged → screening → assessment → interview → offer → negotiating → accepted
                                                       ↘
                                       rejected | withdrawn | ghosted | on_hold
```

| Helper | File | Behavior |
| ------ | ---- | -------- |
| `defaultStageFor(status)` | `applications/domain/status-resolver.service.ts` | Maps a status to its canonical stage (`applied→submitted`, `acknowledged→auto_reply`, `screening→recruiter_screen`, `assessment→take_home`, `interview→tech_interview_1`, `offer→offer_received`, `negotiating→offer_negotiation`, `accepted→offer_accepted`, `rejected/withdrawn/ghosted/on_hold→closed`). |
| `isFirstResponseTransition(from, to)` | same | `true` only if `from === 'applied'` and `to !== 'applied'` and `to !== 'ghosted'`. When `true` and `firstResponseAt` is empty, `changeStatus` sets it. |
| `isClosingTransition(to)` | same | `true` for `accepted/rejected/withdrawn/ghosted`. When `true`, `closedAt = occurredAt`. **If you reopen** to a non-terminal status, `closedAt` is cleared. |
| `funnelIndex(status)` | `applications/domain/application.enums.ts` | Position of `status` in `FUNNEL_ORDER`. `-1` for `withdrawn/rejected/ghosted/on_hold`. |
| `isActiveStatus(status)` | same | Membership in `ACTIVE_STATUSES`. |
| `isTerminalStatus(status)` | same | Membership in `TERMINAL_STATUSES`. |

The same helpers are reused inside `DashboardService` so the funnel and the
reactive UI agree on what "responded ≥ screening" means.

`firstResponseAt` is also filled when `ApplicationEventsService.create`
receives an event of types `MESSAGE_RECEIVED`, `EMAIL_RECEIVED`,
`INTERVIEW_SCHEDULED`, `ASSESSMENT_ASSIGNED`, `FEEDBACK_RECEIVED`,
`OFFER_RECEIVED` (and only if the column is still null). Any event bumps
`lastActivityAt`.

---

## 8. Why this shape — design decisions

| Decision | Why |
| -------- | --- |
| **No authentication** | Single-operator product. Adding auth would balloon the surface (sessions, MFA, password resets, rate limiting per identity) without delivering value to the only user. The trust boundary is the network perimeter — see [`security.md`](./security.md). |
| **Status + stage as separate fields** | Status is the macro phase; stage is the granular round (e.g. `interview` × `tech_interview_2`). Keeping them split lets dashboards aggregate at status level while UI surfaces show the precise stage. |
| **Append-only `ApplicationEvent` timeline** | Cheap auditability. Status transitions, manual notes, interviews and incoming messages are all rows; nothing is mutated retroactively except `firstResponseAt`/`lastActivityAt` on the parent (and only forward in time). |
| **Selectors as `VARCHAR` + vocabulary table** | Vocabularies (`applicationMethod`, `position`, `employmentType`, `platform`) need to be user-extensible at runtime. PostgreSQL enums make `ALTER TYPE … ADD VALUE` painful and require migrations. Strings + a JSONB `formConfig` row let users add/rename/hide entries without touching the schema. `workMode` stays a strict enum — the four values cover every meaningful case. |
| **Asynchronous write-mirror replica** | The replica is a *backup with read access*, not a high-availability hot standby. The middleware queues writes serially with FK-aware retries; if the replica is down, the primary keeps serving. Reconciliation is offline (`db:status`, `db:sync*`). This is purposely simple: Postgres logical replication would be more correct but operationally heavier than the use case warrants. |
| **`PlatformSettings` is a single row** | The product is single-operator. A dedicated table feels heavy, but it lets us version it, audit it via `updatedAt`, and ship validation logic that shares the same `assertValidFormConfig` from any future UI client. |
| **Theming as CSS variables, 12 × 6 = 72 combinations** | All chart colors (`--chart-1..5` + `--chart-foreground`) are redefined per preset so Recharts inherits the correct palette without per-component logic. Switching theme is a single class swap on `<html>`. |
