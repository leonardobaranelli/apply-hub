# Database

> Source of truth: [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma).
> PostgreSQL 16 in production and development. Prisma 5 is the only ORM.

---

## 1. Aggregates

Six aggregates plus one implicit pivot. Every model uses `@@map` to a
snake-case table name and declares explicit indexes for filter and sort
columns.

| Aggregate | Table | Role |
| --------- | ----- | ---- |
| `Contact` | `contacts` | Reusable people (recruiters, hiring managers, referrals). m:n with `JobApplication` via the implicit pivot `_ApplicationContacts`. |
| `JobApplication` | `job_applications` | One opportunity. Owns status, stage, priority, salary band, denormalized vacancy contact, optional FK to `JobSearchSession`. |
| `JobSearchSession` | `job_search_sessions` | Logged search session (platform, query, filters, posting window). Aggregates the `JobApplication` rows it produced. |
| `ApplicationEvent` | `application_events` | Append-only timeline. One row per status/stage change, message, interview, note, etc. |
| `Template` | `templates` | Reusable copy (cover letter, email, messages, follow-ups). |
| `PlatformSettings` | `platform_settings` | Single row (`id="default"`) with UI prefs (`themeId`, `appearanceMode`) and the `formConfig` JSONB. |

Implicit m:n pivot: `_ApplicationContacts` (Prisma-managed). Sync scripts
treat it explicitly via raw SQL because Prisma does not expose it as a model
delegate — see §4.

---

## 2. Schema details

### 2.1 `Contact` (`contacts`)

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `Uuid` | PK, `@default(uuid())`. |
| `name` | `VarChar(200)` | Required. |
| `title` | `VarChar(200)?` | — |
| `role` | `ContactRole` enum | default `recruiter`. |
| `email` | `VarChar(200)?` | indexed. |
| `phone` | `VarChar(50)?` | — |
| `linkedinUrl` | `VarChar(500)?` | — |
| `notes` | `Text?` | — |
| `companyName` | `VarChar(200)?` | indexed; trimmed by service. |
| `createdAt` / `updatedAt` | `Timestamptz(6)` | Prisma-managed. |

Indexes: `(email)`, `(companyName)`. Relation:
`applications JobApplication[] @relation("ApplicationContacts")`.

### 2.2 `JobApplication` (`job_applications`)

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `Uuid` | PK. |
| `companyName` | `VarChar(200)` | required, trimmed by service. |
| `companyUrl` | `VarChar(500)?` | — |
| `roleTitle` | `VarChar(250)` | required. |
| `jobTitle` | `VarChar(250)` | required (default `""` only at the schema level, the DTO requires non-empty). |
| `position` | `VarChar(48)` | default `'backend'`. Strings = built-in IDs ∪ custom slugs from `formConfig.customPositionTypes`. |
| `jobDescription` | `Text?` | — |
| `jobUrl` | `VarChar(500)?` | — |
| `location` | `VarChar(200)?` | — |
| `workMode` | `WorkMode` enum | default `unknown`. **Strict enum**, no custom slugs. |
| `employmentType` | `VarChar(48)?` | vocabulary. |
| `applicationDate` | `Date` | required. |
| `vacancyPostedDate` | `Date` | default `now()`; service overrides to `applicationDate ?? today`. |
| `applicationMethod` | `VarChar(64)` | default `'linkedin_easy_apply'`. Vocabulary. |
| `source` | `VarChar(100)?` | — |
| `platform` | `VarChar(100)?` | — |
| `salaryMin` / `salaryMax` | `Decimal(12,2)?` | serialized as **string** by Prisma. |
| `currency` | `VarChar(10)?` | — |
| `salaryPeriod` | `VarChar(20)?` | — |
| `status` | `ApplicationStatus` enum | default `applied`. |
| `stage` | `ApplicationStage` enum | default `submitted`. |
| `priority` | `Priority` enum | default `medium`. |
| `tags` | `String[]` | default `[]`. |
| `notes` | `Text?` | — |
| `resumeVersion` | `Text?` | — |
| `postingLanguage` | `JobPostingLanguage?` | enum `en|es`. |
| `contactName` / `contactLinkedin` / `contactEmail` / `contactPhone` / `contactOther` | denormalized vacancy contact. | — |
| `firstResponseAt` / `lastActivityAt` / `closedAt` / `archivedAt` | `Timestamptz(6)?` | service-derived. |
| `createdAt` / `updatedAt` | `Timestamptz(6)` | Prisma-managed. |
| `jobSearchSessionId` | `Uuid?` | FK to `JobSearchSession.id`, `onDelete: SetNull`. |

Indexes: `(status)`, `(position)`, `(applicationDate)`, `(archivedAt)`,
`(companyName)`, `(jobSearchSessionId)`.

Relations:
- `events ApplicationEvent[]`.
- `contacts Contact[] @relation("ApplicationContacts")`.

### 2.3 `JobSearchSession` (`job_search_sessions`)

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `Uuid` | PK. |
| `platform` | `VarChar(48)` | default `'other'`. Vocabulary. |
| `platformOther` | `VarChar(100)?` | only persisted when `platform === 'other'`. |
| `queryTitle` | `VarChar(250)` | required, trimmed by service. |
| `filterDescription` | `Text?` | trimmed. |
| `jobPostedFrom` | `Date` | default `now()`. |
| `searchedAt` | `Timestamptz(6)` | default `now()`. |
| `resultsApproxCount` | `Int?` | 0..500000 (DTO range). |
| `isComplete` | `Boolean` | default `false`. |
| `searchUrl` | `VarChar(1000)?` | trimmed. |
| `notes` | `Text?` | trimmed. |
| `createdAt` / `updatedAt` | `Timestamptz(6)` | — |

Indexes: `(searchedAt)`, `(platform)`. Relation:
`applications JobApplication[]`.

### 2.4 `ApplicationEvent` (`application_events`)

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `Uuid` | PK. |
| `applicationId` | `Uuid` | FK to `JobApplication.id`, `onDelete: Cascade`. |
| `type` | `ApplicationEventType` enum | required. |
| `newStatus` | `ApplicationStatus?` | optional. |
| `newStage` | `ApplicationStage?` | optional. |
| `channel` | `EventChannel?` | optional. |
| `title` | `VarChar(250)` | required. |
| `description` | `Text?` | — |
| `occurredAt` | `Timestamptz(6)` | required. |
| `metadata` | `JsonB?` | free-form. Status changes carry `{ previousStatus, previousStage }`. Submissions carry `{ applicationMethod, source, platform }`. |
| `createdAt` / `updatedAt` | `Timestamptz(6)` | — |

Indexes: `(applicationId, occurredAt)`, `(type)`, `(occurredAt)`.

Cascades:
- `ApplicationEvent.application → onDelete: Cascade`. Deleting an application
  removes its timeline atomically.
- `JobApplication.jobSearchSession → onDelete: SetNull`. Deleting a session
  leaves applications with `jobSearchSessionId = null`.

### 2.5 `Template` (`templates`)

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `Uuid` | PK. |
| `name` | `VarChar(200)` | required. |
| `type` | `TemplateType` enum | default `email`. |
| `subject` | `VarChar(250)?` | — |
| `body` | `Text` | required. |
| `language` | `VarChar(50)?` | usually `en` / `es`. |
| `tags` | `String[]` | default `[]`. |
| `usageCount` | `Int` | default `0`. Incremented by `markUsed`. |
| `isFavorite` | `Boolean` | default `false`. |
| `lastUsedAt` | `Timestamptz(6)?` | refreshed by `markUsed`. |
| `createdAt` / `updatedAt` | `Timestamptz(6)` | — |

Index: `(type)`.

### 2.6 `PlatformSettings` (`platform_settings`)

Single-row store (`id="default"`).

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `VarChar(32)` | PK; always `'default'`. |
| `themeId` | `VarChar(32)` | default `'ocean'`. ∈ {ocean, sky, indigo, violet, fuchsia, rose, coral, terracotta, amber, lime, emerald, slate}. |
| `appearanceMode` | `VarChar(16)` | default `'dark'`. ∈ {dark, night, dim, mist, soft, light}. |
| `formConfig` | `JsonB` | required (initial value `{}`). End-to-end validated — see §3. |
| `createdAt` / `updatedAt` | `Timestamptz(6)` | — |

---

## 3. Configurable vocabularies (`formConfig`)

`formConfig` lives inside `platform_settings` as JSONB. Its shape mirrors
`backend/src/modules/platform-settings/dto/form-config.dto.ts` and is
asserted by `PlatformSettingsService.assertValidFormConfig`.

```ts
interface PlatformFormConfig {
  customApplicationMethods?: string[];
  applicationMethodLabels?: Record<string, string>;
  applicationMethodOrder?: string[];
  applicationMethodHidden?: string[];
  workModeLabels?: Record<string, string>;

  customPositionTypes?: string[];
  positionLabels?: Record<string, string>;
  positionOrder?: string[];
  positionHidden?: string[];

  customEmploymentTypes?: string[];
  employmentLabels?: Record<string, string>;
  employmentOrder?: string[];
  employmentHidden?: string[];

  customSearchPlatforms?: string[];
  searchPlatformLabels?: Record<string, string>;
  searchPlatformOrder?: string[];
  searchPlatformHidden?: string[];

  roleTitleOptions?: string[];      // ≤ 80 entries, ≤ 200 chars each
  resumeVersionOptions?: string[];  // ≤ 40 entries, ≤ 120 chars each
}
```

### 3.1 Built-in IDs (mirror Prisma enums)

| Group | IDs |
| ----- | --- |
| `applicationMethod` | `email`, `linkedin_easy_apply`, `linkedin_external`, `company_website`, `job_board`, `referral`, `recruiter_outreach`, `other` |
| `position` | `backend`, `fullstack`, `ai_developer` |
| `employmentType` | `full_time`, `part_time`, `contract`, `internship`, `freelance` |
| `searchPlatform` | `linkedin`, `google`, `indeed`, `glassdoor`, `job_board`, `company_site`, `recruiter_portal`, `other` |
| `workMode` | `remote`, `hybrid`, `onsite`, `unknown` *(strict enum, no custom)* |

The active universe for any group is `built-in ∪ custom*`. The validation
helpers (`backend/src/modules/platform-settings/domain/form-config.helpers.ts`)
expose `allMethodIds(config)`, `allPositionIds(config)`,
`allEmploymentIds(config)`, `allSearchPlatformIds(config)`.

### 3.2 Validation rules

| Field | Rule |
| ----- | ---- |
| `custom*` | Each entry matches `^[a-z][a-z0-9_]{0,47}$`, must not collide with a built-in ID, no duplicates within the array. |
| `*Order` | If present, must be a **full permutation** of the universe (same length, no duplicates, no unknowns). |
| `*Hidden` | Subset of the universe. |
| `*Labels` | Keys must be members of the universe. Empty-string values are dropped at merge time. |
| `workModeLabels` | Keys must be members of `WorkMode` enum (no customization at the slug level). |
| `roleTitleOptions` | ≤ 80 entries (each entry ≤ 200 chars enforced by DTO `@MaxLength`). |
| `resumeVersionOptions` | ≤ 40 entries (each ≤ 120 chars). |

Failure raises `400 BadRequestException` with a precise message
(e.g. `applicationMethodOrder must list each option exactly once (9 total)`).

### 3.3 Re-validation on writes

`ApplicationsService.assertApplicationSelectors` runs on `create` and
`update` for any of `applicationMethod`, `position`, `employmentType`.
`SearchSessionsService.assertSearchPlatform` runs on `create` and `update`
for `platform`. **The implication**: removing a custom slug from settings
does **not** rewrite history (existing rows keep their value), but it
prevents new rows from using it.

### 3.4 `ensure-text-selector-columns.mjs`

Older deployments stored `position`, `employment_type`, `application_method`
and `platform` as **PostgreSQL enums**. Since these vocabularies must accept
custom slugs at runtime, the columns were migrated to `VARCHAR`.

`backend/scripts/ensure-text-selector-columns.mjs` performs that migration
**idempotently**:

1. Checks whether the columns are still `USER-DEFINED` (Postgres enum) via
   `information_schema.columns.data_type`.
2. If so, drops the column default, runs
   `ALTER TABLE … ALTER COLUMN … TYPE VARCHAR(N) USING (col::text)`, then
   restores the default literal (`'backend'`, `'linkedin_easy_apply'`,
   `'other'`).
3. If the column is already `VARCHAR`, skips.

This script is run **before** `prisma db push` in the dev `Dockerfile`
(`CMD`) and via the `npm run prisma:db:push` shortcut, so a fresh `db push`
on a legacy database never produces the dreaded "data loss" warning.

For production, the contract is the same but applied via
`prisma migrate deploy` (the migration files are committed alongside the
schema once you start using `npm run prisma:migrate:dev`).

---

## 4. Write-mirror replica

`backend/src/prisma/replication.middleware.ts` implements an asynchronous
write-mirror that runs as Prisma middleware (`prisma.$use(...)`).

### 4.1 Why a middleware (and not Postgres logical replication)

- Single operator. Operational simplicity > correctness in failure
  scenarios that are unlikely in this product.
- The replica is a *backup with read access*, not a high-availability hot
  standby. Reads never go to the replica.
- Logical replication adds a heavy ops burden (slots, publications,
  subscriptions, conflict resolution) for a feature that is fine being
  eventually consistent.

### 4.2 Contract — what the middleware guarantees

The state machine is locked in place by
[`backend/test/prisma/replication.middleware.spec.ts`](../backend/test/prisma/replication.middleware.spec.ts).
The contract is:

1. **Replicated actions** = `{create, createMany, update, updateMany, upsert, delete, deleteMany}`.
   Read actions (`findUnique`, `findFirst`, `findMany`, `count`,
   `aggregate`, `groupBy`) are never replicated.
2. **All 6 supported model delegates** are replicable (`contact`,
   `jobSearchSession`, `jobApplication`, `applicationEvent`, `template`,
   `platformSettings`). Schema growth must update both the replication
   middleware and the sync scripts — the test suite enforces lock-step.
3. **UUIDs are pre-generated** on `create` / `createMany` *before* delegating
   to the primary, so primary and replica end up with the same primary key.
   Caller-supplied `id`s are respected (not overwritten).
4. **After a successful primary write**, the same operation is enqueued
   against the replica.
5. **The queue is serial** (`replicationQueue: Promise<void>` chained) to
   preserve write order and avoid FK races (e.g. inserting an event before
   the application).
6. **Args are snapshotted** with `structuredClone(...)` at enqueue time so
   later mutations on the original object cannot bleed into the replica
   call.
7. **Retry policy** = 4 attempts (1 + 3 retries) with backoff `100ms / 250ms / 500ms`
   when the error is `P2003 — Foreign key constraint violated`. Other errors
   are surfaced once and not retried.
8. **Replica failures are isolated**: errors from the queue are caught and
   logged at `warn` level. They never reject the primary request.
9. **Reads never leave the primary.**

### 4.3 Out-of-band reconciliation

If the replica was down or drifted, three scripts in `backend/scripts/`
reconcile the two databases without disrupting traffic:

- `db-status.mjs` — parity report (counts + `MAX(updatedAt)` per model + the
  pivot count). Outputs JSON. Use `npm run db:status`.
- `db-sync-incremental.mjs` — paginated upsert via Prisma. FK-safe model
  order:
  1. `contact`
  2. `jobSearchSession`
  3. `jobApplication`
  4. `applicationEvent`
  5. `template`
  6. `platformSettings`
  Then the implicit `_ApplicationContacts` pivot (raw SQL,
  `INSERT … ON CONFLICT DO NOTHING`). Each model is paginated by `id ASC`
  with batch size 200. Upserts only when `source.updatedAt > target.updatedAt`
  (or when the target row is missing). Use the npm shortcuts:
  ```bash
  npm run db:sync:incremental:local-to-replica
  npm run db:sync:incremental:replica-to-local
  ```
  Append `-- --prune` to also delete target rows that no longer exist on
  the source (children pruned first to respect FKs).
- `db-sync.mjs` — full snapshot via
  `pg_dump --no-owner --no-acl --clean --if-exists | psql --set=ON_ERROR_STOP=1`
  inside a one-off `postgres:18-alpine` container, so you don't need
  `pg_dump` installed on the host. Defaults to network `apply-hub_default`;
  override with `DOCKER_NETWORK=...`. Use the npm shortcuts:
  ```bash
  npm run db:sync:local-to-replica
  npm run db:sync:replica-to-local
  ```

The model lists in both `db-status.mjs` and `db-sync-incremental.mjs` are
asserted by the script test suites
([`backend/test/scripts`](../backend/test/scripts)) to mirror the schema —
adding a new model to Prisma without updating both scripts will fail CI.

### 4.4 Caveats

- **Eventually consistent.** If the replica is down, queued writes are lost
  for the duration of the outage. They must be reconciled with `db:sync*`.
- **No schema replication.** Prisma migrations applied to the primary do
  **not** touch the replica. Always run the equivalents with the `:replica`
  suffix (see [`operations.md`](./operations.md)).
- **Single-operator assumption.** No auth; the security model is the network
  perimeter only. See [`security.md`](./security.md).

---

## 5. Seed data

`backend/src/database/seed.ts` populates `Template` with **12 templates**
(6 EN + 6 ES) on first run:

- Generic cover letter — Backend (EN/ES)
- Direct application email (EN/ES)
- LinkedIn — Recruiter connection (EN/ES) — `isFavorite: true`
- LinkedIn — Post-Easy Apply message (EN/ES)
- Post-interview follow-up (EN/ES)
- Referral request (EN/ES)

The script is **idempotent**: if `templates.count() > 0`, it logs
`Templates already seeded (N). Skipping.` and exits without changes. Run
with `npm run seed`.

---

## 6. Day-to-day cheat sheet

| Task | Command (run from `backend/`) |
| ---- | ----------------------------- |
| Regenerate Prisma client | `npm run prisma:generate` |
| Apply schema in dev (no migrations) | `npm run prisma:db:push` *(also runs `ensure-text-selector-columns.mjs`)* |
| Create a versioned migration in dev | `npm run prisma:migrate:dev -- --name <slug>` |
| Apply versioned migrations in prod | `npm run prisma:migrate:deploy` |
| Open Studio against the local DB | `npm run prisma:studio` *(rewrites compose hostname `postgres → 127.0.0.1` from the host)* |
| Open Studio against the replica | `npm run prisma:studio:replica` |
| Push schema to the replica once | `npm run prisma:db:push:replica` |
| Seed templates | `npm run seed` |
| Parity report | `npm run db:status` |
| Forward fix (most common) | `npm run db:sync:incremental:local-to-replica` |
| Backward fix (recovery) | `npm run db:sync:incremental:replica-to-local` |
| Full snapshot (severe drift / restore) | `npm run db:sync:local-to-replica` *(or `replica-to-local`)* |
