# Backend deep dive

> NestJS 10, Prisma 5, PostgreSQL 16. TypeScript 5.7, ECMAScript modules,
> ESLint + Prettier. The directory is `backend/`. Run scripts from
> `backend/` unless stated otherwise.

For the architectural overview see [`architecture.md`](./architecture.md);
for the schema see [`database.md`](./database.md); for HTTP details see
[`api.md`](./api.md).

---

## 1. Source tree

```
backend/
├── prisma/schema.prisma                      # schema source of truth
├── scripts/                                  # ops on primary / replica (mjs)
│   ├── db-status.mjs                         # parity report
│   ├── db-sync.mjs                           # full snapshot via pg_dump|psql
│   ├── db-sync-incremental.mjs               # paginated upsert by id
│   ├── ensure-text-selector-columns.mjs      # idempotent enum→VARCHAR migration
│   ├── prisma-studio-local.mjs               # Studio that resolves `postgres → 127.0.0.1`
│   └── run-on-replica.mjs                    # runs any command with DATABASE_URL=replica
├── src/
│   ├── main.ts                               # bootstrap (see architecture.md §2)
│   ├── app.module.ts                         # ConfigModule + Prisma + 7 feature modules
│   ├── common/
│   │   ├── dto/pagination.dto.ts             # PaginationDto + PaginatedResult<T>
│   │   └── filters/http-exception.filter.ts  # uniform error envelope
│   ├── config/
│   │   ├── configuration.ts                  # typed AppConfig + factory
│   │   └── validation.schema.ts              # Joi (abortEarly: true)
│   ├── database/seed.ts                      # idempotent template seeder
│   ├── prisma/
│   │   ├── prisma.module.ts                  # @Global
│   │   ├── prisma.service.ts                 # primary + replica + middleware install
│   │   └── replication.middleware.ts         # write-mirror state machine
│   └── modules/
│       ├── applications/
│       ├── application-events/
│       ├── contacts/
│       ├── search-sessions/
│       ├── templates/
│       ├── dashboard/
│       └── platform-settings/
└── test/                                     # see testing.md
```

A `companies` directory exists under `modules/` with `dto/` and `entities/`
placeholders. There is no controller/service yet — it is reserved for a
future "rich Company" aggregate. `Contact.companyName` and
`JobApplication.companyName` are denormalized strings today.

---

## 2. Bootstrap and cross-cutting

`src/main.ts` and `src/app.module.ts` are described in
[`architecture.md`](./architecture.md#2-backend-bootstrap-srcmaints). Three
files cover all the cross-cutting concerns:

| File | Responsibility |
| ---- | -------------- |
| `common/dto/pagination.dto.ts` | `PaginationDto` (page ≥ 1, limit 1..200) and `PaginatedResult<T>` envelope. |
| `common/filters/http-exception.filter.ts` | Uniform error response. Logs stack only on `>= 500`. Maps `HttpException` and arbitrary errors. |
| `config/configuration.ts` + `config/validation.schema.ts` | Typed `AppConfig`, Joi validation at boot. See [`configuration.md`](./configuration.md). |

Two rules every service follows:

- Read configuration **only** through `ConfigService` — never `process.env`.
- Use Prisma **only** through the global `PrismaService`. Instantiating
  `new PrismaClient()` inside a feature module bypasses the replication
  middleware and breaks the contract; the test suite asserts every service
  routes through `PrismaService`.

---

## 3. `PrismaService` and the write-mirror

The full state machine lives in
[`database.md`](./database.md#4-write-mirror-replica). Implementation notes:

- `PrismaService` extends `PrismaClient`. On `onModuleInit` it
  `$connect()`s the primary, then if `database.replicaUrl` is set, tries to
  `$connect()` a separate `PrismaClient` against the replica.
- On replica connection success, `ReplicationMiddleware` is constructed
  with the replica delegate map and installed via `this.$use(mw.middleware)`.
- On replica connection failure, the warning is logged and the app keeps
  running. Reads never go to the replica anyway, so primary traffic is
  unaffected.
- On `onModuleDestroy`, the queue drains (`replication.drain()`) before
  disconnecting both clients. Tests use `drain()` to assert side effects
  after the queue settles.

The middleware is intentionally **pure**: every collaborator is injectable
(retry delays, `sleep`, `generateId`, `cloneArgs`). That is what makes the
unit tests deterministic.

---

## 4. Modules

Every module follows the canonical shape described in
[`architecture.md`](./architecture.md#41-canonical-module-shape):
controller, service, module, `domain/`, `dto/`. Below is the per-module
contract — what each service guarantees, what each DTO accepts, and what
behavior the test suite locks in.

### 4.1 `ApplicationsModule`

Files: `modules/applications/{applications.controller.ts, applications.service.ts, applications.module.ts}`,
`modules/applications/domain/{application.enums.ts, status-resolver.service.ts}`,
`modules/applications/dto/{create-application.dto.ts, update-application.dto.ts, query-application.dto.ts, change-status.dto.ts}`.

Imports `PlatformSettingsModule` to validate selectors against the
configured vocabulary.

| Endpoint | Implementation notes |
| -------- | -------------------- |
| `POST /applications` | `assertApplicationSelectors` first; date defaults; `status ??= APPLIED`; `stage ??= defaultStageFor(status)`; if `jobSearchSessionId` is provided, `assertSearchSessionExists`. Inside `prisma.$transaction` creates the application **and** an `application_submitted` event with `metadata: { applicationMethod, source, platform }`. |
| `GET /applications` | `findAll(query)` builds a `Prisma.JobApplicationWhereInput` from the filters described in [`api.md`](./api.md#12-get-applications), runs `findMany + count` inside a `$transaction([...])`, returns `PaginatedResult<JobApplication>`. Sort uses an explicit map (`sortMap`) and always tie-breaks with `createdAt: 'desc'`. |
| `GET /applications/:id` | Returns the row with `contacts: true` and a slim `jobSearchSession` projection. `404` if missing. |
| `PATCH /applications/:id` | Runs `assertApplicationSelectors` for any selector field present in the DTO. Builds a typed `UpdateInput` field by field (preserving null vs undefined semantics). For `jobSearchSessionId`: `null → disconnect`; UUID → `connect` (existence checked). |
| `PATCH /applications/:id/status` | Inside `$transaction`: loads row, computes `newStage`, sets `lastActivityAt`, conditionally `firstResponseAt`/`closedAt`, and emits a single `ApplicationEvent` (type derived via `eventTypeForStatus(newStatus)`) with `metadata: { previousStatus, previousStage, ...dto.metadata }`. |
| `PATCH /applications/:id/contacts` | Replaces the linked contact set via `set: contactIds.map(...)` semantics. |
| `PATCH /applications/:id/archive` / `restore` | Sets / clears `archivedAt`. |
| `POST /applications/mark-stale-ghosted?days=N` | Default 21. Loads `status ∈ {applied, acknowledged}`. For each, compares `lastActivityAt ?? applicationDate` to `now - N days`. If older, replays `changeStatus({ status: GHOSTED, stage: CLOSED, ... })`. Returns `{ ghostedCount }`. |
| `DELETE /applications/:id` | Hard delete. `P2025 → 404 NotFoundException`. |

`StatusResolverService` (in `domain/`) holds the pure transition rules:
`defaultStageFor`, `isFirstResponseTransition`, `isClosingTransition`. The
service has zero Nest dependencies aside from `@Injectable`. The same logic
is consumed by `DashboardService` for the funnel.

#### Key invariants asserted by tests

[`backend/test/modules/applications.service.spec.ts`](../backend/test/modules/applications.service.spec.ts)
locks in:

- Creation runs inside a single `$transaction` and emits
  `APPLICATION_SUBMITTED` with the right metadata.
- Trims `companyName` and `jobTitle`. Defaults `applicationDate`,
  `vacancyPostedDate`, `lastActivityAt`.
- Rejects unknown `applicationMethod` with `BadRequestException`.
- Rejects unknown `jobSearchSessionId` with `NotFoundException`.
- `changeStatus(applied → screening)` sets `firstResponseAt` and emits
  `STATUS_CHANGED` with previous metadata.
- `changeStatus(interview → offer)` emits `OFFER_RECEIVED` and
  `newStage = OFFER_RECEIVED`.
- Terminal transitions (`rejected/accepted/withdrawn/ghosted`) set
  `closedAt`.
- Reopening from a terminal state to a non-terminal status clears
  `closedAt`.
- `archive` / `restore` set / clear `archivedAt` via
  `prisma.jobApplication.update`.
- `linkContacts` uses `set: [{ id }]` semantics.
- `remove` calls `prisma.jobApplication.delete` and translates `P2025` to
  `NotFoundException`.
- `markStaleAsGhosted` replays `changeStatus` per stale row, so each gets
  its own `GHOSTED_MARKED` event and goes through transactional logic.

### 4.2 `ApplicationEventsModule`

Files: `modules/application-events/{application-events.controller.ts, application-events.service.ts, application-events.module.ts}`,
`modules/application-events/domain/event.enums.ts`,
`modules/application-events/dto/create-event.dto.ts`.

The controller is mounted on the empty path so `@Get('applications/:applicationId/events')`
maps to `/api/applications/:applicationId/events`, while `@Post('events')`,
`@Get('events/:id')`, `@Delete('events/:id')` map to `/api/events*`.

Behavior:

- `create(dto)` runs inside `prisma.$transaction`:
  - Loads the application with `select: { id, firstResponseAt }`.
    Throws `NotFoundException` if missing.
  - Updates `lastActivityAt = occurredAt`. If `firstResponseAt` is null
    **and** `dto.type ∈ RESPONSE_TYPES`, sets it to `occurredAt`.
  - Inserts the event row.
- `findByApplication(id)` returns `ApplicationEvent[]` ordered by
  `occurredAt desc`.
- `findOne(id)` / `remove(id)` are standard, with `P2025 → 404`.

`RESPONSE_TYPES = { MESSAGE_RECEIVED, EMAIL_RECEIVED, INTERVIEW_SCHEDULED, ASSESSMENT_ASSIGNED, FEEDBACK_RECEIVED, OFFER_RECEIVED }`.

[`backend/test/modules/application-events.service.spec.ts`](../backend/test/modules/application-events.service.spec.ts)
asserts: missing parent → `NotFoundException`; transactional flow bumps
`lastActivityAt`; `EMAIL_RECEIVED` sets `firstResponseAt` once but never
overwrites it; `NOTE_ADDED` does not imply a response; `P2025 → 404`.

### 4.3 `ContactsModule`

Files: `modules/contacts/{contacts.controller.ts, contacts.service.ts, contacts.module.ts}`,
`modules/contacts/domain/contact.enums.ts`,
`modules/contacts/dto/{create-contact.dto.ts, update-contact.dto.ts, query-contact.dto.ts}`.

Standard CRUD. `companyName` is trimmed on create and update. `findAll`
filters via ILIKE on `name`, `email`, `title`, `companyName`, plus exact
`role` match. Order: `name asc`. `remove` translates `P2025 → 404`.

[`backend/test/modules/contacts.service.spec.ts`](../backend/test/modules/contacts.service.spec.ts)
locks in trimming, pagination skip/take math, missing-row → `NotFoundException`,
and the replication-friendly `prisma.contact.{create,update,delete}`
contracts.

### 4.4 `SearchSessionsModule`

Files: `modules/search-sessions/{search-sessions.controller.ts, search-sessions.service.ts, search-sessions.module.ts}`,
`modules/search-sessions/domain/search-session.enums.ts`,
`modules/search-sessions/dto/{create-search-session.dto.ts, update-search-session.dto.ts, query-search-session.dto.ts}`.

Imports `PlatformSettingsModule` to validate `platform` against
`allSearchPlatformIds(formConfig)`. Behavior:

- `create(dto)`:
  - Validates `platform`.
  - `searchedAt ??= now()`.
  - `jobPostedFrom ??= calendar day of searchedAt` (UTC).
  - `platformOther` is persisted **only** if `platform === 'other'`. Otherwise
    `null`.
  - Trims `queryTitle`, `filterDescription`, `notes`, `searchUrl`.
- `findAll(query)`: ILIKE filter on `queryTitle / filterDescription / notes / platformOther`,
  optional exact `platform`, optional `searchedAt` range. Order:
  `searchedAt desc`.
- `update(id, dto)`: re-validates `platform` if present. If `platform`
  changes to anything other than `'other'`, `platformOther` is cleared
  unconditionally (even if the DTO sent a value).
- `remove(id)`: deletes after existence check. Linked applications keep
  `jobSearchSessionId = null` per the schema's `onDelete: SetNull`.

[`backend/test/modules/search-sessions.service.spec.ts`](../backend/test/modules/search-sessions.service.spec.ts)
locks in: unknown platform → `BadRequestException`; trim semantics; the
`platformOther` lifecycle (cleared when not `'other'`, kept when it is);
`update` clears `platformOther` when switching away from `'other'`.

### 4.5 `TemplatesModule`

Files: `modules/templates/{templates.controller.ts, templates.service.ts, templates.module.ts}`,
`modules/templates/domain/template.enums.ts`,
`modules/templates/dto/{create-template.dto.ts, update-template.dto.ts, query-template.dto.ts}`.

Behavior:

- `create(dto)`: defaults `tags=[]`, `isFavorite=false`.
- `findAll(query)`: ILIKE on `name / subject / body`, optional exact
  `type`, optional `isFavorite=true` if `favoritesOnly`, optional `language`.
  Order: `isFavorite desc, usageCount desc, updatedAt desc`.
- `toggleFavorite(id)`: flips `isFavorite`.
- `markUsed(id)`: `usageCount: { increment: 1 }, lastUsedAt: now`. SPA calls
  this on copy.
- `remove(id)`: `P2025 → 404`.

[`backend/test/modules/templates.service.spec.ts`](../backend/test/modules/templates.service.spec.ts)
locks in: payload defaults; `findAll` filters; `toggleFavorite` flips the
boolean; `markUsed` increments and refreshes; `P2025 → 404`.

### 4.6 `DashboardModule`

Files: `modules/dashboard/{dashboard.controller.ts, dashboard.service.ts, dashboard.module.ts, dashboard.types.ts}`,
`modules/dashboard/dto/dashboard-query.dto.ts`.

`DashboardService` is pure-ish: it loads applications/sessions in memory
and computes everything in JavaScript. No write paths, no joins beyond
`include: { _count: { select: { applications: true } } }` for sessions. The
expensive bit is `activityHeatmap`, which uses `$queryRaw`:

```sql
SELECT
  EXTRACT(DOW FROM occurred_at)::int  AS weekday,
  EXTRACT(HOUR FROM occurred_at)::int AS hour,
  COUNT(*)::int                       AS count
FROM application_events
WHERE occurred_at >= $1 AND occurred_at <= $2
GROUP BY weekday, hour
ORDER BY weekday, hour
```

The full output shape is in [`api.md`](./api.md#6-dashboard--apidashboard).
Notable rules:

- Excludes archived applications (`where.archivedAt = null`).
- An application counts as **responded** if `firstResponseAt` is set **or**
  `funnelIndex(status) >= funnelIndex(SCREENING)` — see
  `hasReachedFunnelStep`. This protects manual reclassifications without an
  event.
- All percentages: `Math.round(x * 10) / 10` (one decimal).
- `topCompanies` deduplicates by `trim().toLowerCase()` and reports the
  first observed casing.
- `methodEffectiveness` and `byMethod` are sorted descending by volume.
- Date range is honored on both `applications` queries and on the heatmap
  raw SQL.

`SearchActivityOverview` aggregates `JobSearchSession`:

- `byPlatform` keys are the *raw* `platform` value (vocabulary). The SPA
  resolves the friendly label via `usePlatformSettings()`.
- `byCompletion` is `complete` / `active`.
- `topQueries` is the top 15 (case-insensitive dedup, original casing
  preserved).
- `recentSessions` is the latest 20 with `applicationsCount` from
  `_count.applications` (no n+1).

### 4.7 `PlatformSettingsModule`

Files: `modules/platform-settings/{platform-settings.controller.ts, platform-settings.service.ts, platform-settings.module.ts}`,
`modules/platform-settings/domain/{form-config.helpers.ts, theme.constants.ts}`,
`modules/platform-settings/dto/{form-config.dto.ts, update-platform-settings.dto.ts}`.

Behavior:

- `get()` returns the row. **Creates it** with
  `{ id: 'default', themeId: 'ocean', appearanceMode: 'dark', formConfig: {} }`
  on first call.
- `getFormConfig()` returns `formConfig as FormConfigDto` (or `{}`).
- `update(dto)` ensures the row exists, then `assertValidFormConfig` if
  `dto.formConfig` is present, then issues a partial `update`.

`assertValidFormConfig` runs every check described in
[`database.md`](./database.md#3-configurable-vocabularies-formconfig). The
helpers in `form-config.helpers.ts` (`assertCustomSlugs`,
`assertFullPermutation`, `assertSubset`, `assertLabelKeys`,
`allMethodIds/allPositionIds/allEmploymentIds/allSearchPlatformIds`) are
the source of truth and are reused by `ApplicationsService` and
`SearchSessionsService` to re-validate selectors on each write.

`theme.constants.ts` exports `ALLOWED_THEME_IDS` (12) and
`ALLOWED_APPEARANCE_MODES` (6) as readonly tuples; the DTO uses
`@IsIn([...ALLOWED_THEME_IDS])` so additions are a single-line change.

[`backend/test/modules/platform-settings.service.spec.ts`](../backend/test/modules/platform-settings.service.spec.ts)
asserts: returns existing row; creates default on first call; partial
update of `themeId`; rejects custom slugs that collide with built-ins;
rejects unknown `workModeLabels` keys; accepts a valid full-permutation
order including a custom slug.

---

## 5. Database wiring

`PrismaModule` is the single Prisma surface. `PrismaService` uses
`extends PrismaClient` and:

```ts
constructor(configService: ConfigService<AppConfig, true>) {
  const log: Prisma.LogLevel[] = configService.get('database.logging', { infer: true })
    ? ['query', 'info', 'warn', 'error']
    : ['error'];
  super({ log });

  this.replicaUrl = configService.get('database.replicaUrl', { infer: true });
}
```

This is deliberate: the connection string comes from `DATABASE_URL` in
`process.env`, which Prisma reads itself; the replica URL is read once and
used to build a separate `PrismaClient`. There is no DI for the replica —
it lives inside the `PrismaService` instance.

`prisma:generate` is wired as a `postinstall` script so that
`npm install` always produces a fresh client matching the schema. The
`Dockerfile` also runs `npx prisma generate` to be safe across
filesystem-mounted `node_modules` volumes.

---

## 6. NPM scripts (cheat sheet)

Run from `backend/`:

| Script | Purpose |
| ------ | ------- |
| `npm run start:dev` | Nest watch mode. |
| `npm run start:debug` | Nest watch with Node `--inspect`. |
| `npm run build` | `nest build` to `dist/`. |
| `npm run start:prod` | `node dist/main.js`. |
| `npm run lint` / `format` | ESLint with `--fix`; Prettier. |
| `npm test` | Jest, all suites (see [`testing.md`](./testing.md)). |
| `npm run test:watch` / `test:cov` | Watch mode / coverage. |
| `npm run prisma:generate` | Regenerate Prisma client. |
| `npm run prisma:db:push` | `ensure-text-selector-columns.mjs` then `prisma db push`. |
| `npm run prisma:migrate:dev` / `prisma:migrate:deploy` | Versioned migrations. |
| `npm run prisma:studio` | Studio (host-friendly). |
| `npm run seed` | Idempotent template seed. |
| `npm run prisma:db:push:replica` / `prisma:studio:replica` / `seed:replica` | Same, against the replica via `run-on-replica.mjs`. |
| `npm run db:status` | Parity report (primary vs replica). |
| `npm run db:sync:incremental:local-to-replica` / `replica-to-local` | Incremental upsert. Add `-- --prune` to also delete orphan target rows. |
| `npm run db:sync:local-to-replica` / `replica-to-local` | Full snapshot via Docker `pg_dump|psql`. |

---

## 7. TypeScript / build

`tsconfig.json` extends Nest defaults. `tsconfig.build.json` excludes
`test/` and `**/*.spec.ts`. `nest-cli.json` keeps `outDir: dist` and uses
the default Webpack-less compile. `class-validator` decorators rely on
`emitDecoratorMetadata: true` and `experimentalDecorators: true` — ESLint
allows them without warnings.

Jest is configured directly via `jest.config.js`:

- `transform: ts-jest` with `module: 'commonjs'` and `target: ES2022`.
- `testRegex: \\.(spec|test)\\.ts$`.
- `testEnvironment: 'node'`.
- `clearMocks: true` and `restoreMocks: true` between tests.
- `collectCoverageFrom: src/**/*.ts` minus `*.module.ts`, `*.dto.ts`,
  `dto/**`, `index.ts`, `main.ts`.
- The `npm test` script launches Jest with `node --experimental-vm-modules`
  so the script tests can dynamically `import()` `.mjs` files via the
  `helpers/esm-import.ts` shim.
