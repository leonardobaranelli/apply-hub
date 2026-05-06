# HTTP API reference

> Source of truth: the controllers and DTOs under `backend/src/modules/**`.
> Swagger is also available at `/api/docs` whenever `NODE_ENV !== 'production'`.

- **Base URL** (dev): `http://localhost:3001/api`
- **Global prefix**: `/api`
- **Content type**: `application/json` for all bodies and responses.
- **No authentication**. The application assumes a controlled network
  perimeter — see [`security.md`](./security.md).
- Pagination is consistent across every list endpoint:
  ```ts
  type PaginatedResult<T> = {
    data: T[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  };
  ```
  `page` defaults to `1` (`>= 1`), `limit` defaults to `25` (`1..200`).
- Errors follow a uniform envelope produced by `HttpExceptionFilter`:
  ```json
  {
    "statusCode": 400,
    "message": "Invalid applicationMethod",
    "error": "BadRequestException",
    "path": "/api/applications",
    "timestamp": "2026-05-06T14:00:00.000Z"
  }
  ```
  `message` may be a single string or an array of strings (when several
  class-validator constraints fail). Stack traces are logged only for
  `5xx`. Prisma `P2025` (record not found on update/delete) is mapped to
  `404 NotFoundException`.

---

## 1. Applications — `/api/applications`

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/applications` | Create an application + emit timeline event. |
| `GET`  | `/applications` | List with filters, search and pagination. |
| `GET`  | `/applications/:id` | Detail with `contacts` and slim `jobSearchSession`. |
| `PATCH`| `/applications/:id` | Partial update (no status/stage). |
| `PATCH`| `/applications/:id/status` | Transactional status/stage change + event. |
| `PATCH`| `/applications/:id/contacts` | Replace the linked contact set. |
| `PATCH`| `/applications/:id/archive` | Soft archive. |
| `PATCH`| `/applications/:id/restore` | Soft restore. |
| `POST` | `/applications/mark-stale-ghosted?days=N` | Bulk auto-ghost (default 21). |
| `DELETE`| `/applications/:id` | Hard delete (events cascade). |

### 1.1 `POST /applications`

Creates one application **inside a transaction**, also emitting an
`application_submitted` event with `metadata: { applicationMethod, source, platform }`.

**Defaults**

| Field | Default |
| ----- | ------- |
| `applicationDate` | today (UTC date) |
| `vacancyPostedDate` | `applicationDate ?? today` |
| `position` | `'backend'` |
| `applicationMethod` | `'linkedin_easy_apply'` |
| `workMode` | `'unknown'` |
| `priority` | `'medium'` |
| `status` | `'applied'` |
| `stage` | `defaultStageFor(status)` |
| `lastActivityAt` | `new Date()` |
| `tags` | `[]` |

**Validation**

- `applicationMethod`, `position`, `employmentType` must belong to the
  configured vocabulary (built-in IDs ∪ `formConfig.custom*`). On mismatch:
  `400 BadRequestException` (`Invalid applicationMethod` /
  `Invalid position` / `Invalid employmentType`).
- `companyName` is trimmed.
- `jobTitle` is trimmed.
- `companyUrl`, `jobUrl` accept URLs without protocol (`require_protocol: false`).
- `contactEmail` must be a valid email.
- `contactLinkedin` is a string (≤ 500 chars).
- If `jobSearchSessionId` is given, the session must exist (`404` otherwise).

**Request body**

```jsonc
{
  "companyName": "Acme",                          // required
  "companyUrl": "https://acme.com",               // optional, ≤ 500
  "roleTitle": "Senior Backend",                  // required, ≤ 250
  "jobTitle": "Backend Engineer",                 // required, ≤ 250
  "position": "backend",                          // optional (vocabulary)
  "jobDescription": "…",                          // optional
  "jobUrl": "https://…",                          // optional
  "location": "Remote · LATAM",                   // optional
  "workMode": "remote",                           // remote|hybrid|onsite|unknown
  "employmentType": "full_time",                  // optional (vocabulary)
  "applicationDate": "2026-05-06",                // optional, YYYY-MM-DD
  "vacancyPostedDate": "2026-05-04",              // optional, YYYY-MM-DD
  "applicationMethod": "linkedin_easy_apply",     // optional (vocabulary)
  "source": "LinkedIn",                           // optional, ≤ 100
  "platform": "LinkedIn",                         // optional, ≤ 100
  "salaryMin": 120000,                            // optional, decimal(12,2)
  "salaryMax": 150000,                            // optional, decimal(12,2)
  "currency": "USD",                              // optional, ≤ 10
  "salaryPeriod": "year",                         // optional, ≤ 20
  "status": "applied",                            // optional, default 'applied'
  "stage": "submitted",                           // optional
  "priority": "medium",                           // low|medium|high
  "tags": ["nodejs", "remote"],                   // optional, ≤ 20 entries
  "notes": "…",                                   // optional
  "resumeVersion": "English version",             // optional
  "postingLanguage": "en",                        // en|es
  "contactName": "Ada Lovelace",                  // optional
  "contactLinkedin": "https://linkedin.com/in/…", // optional
  "contactEmail": "ada@acme.com",                 // optional, must be email
  "contactPhone": "+1…",                          // optional
  "contactOther": "telegram: @ada",               // optional
  "jobSearchSessionId": "uuid-or-null"            // optional FK
}
```

**Response** — `201 Created` with the persisted `JobApplication`. The
in-line `application_submitted` event is **not** included; fetch
`/applications/:id/events` to retrieve the timeline.

### 1.2 `GET /applications`

**Query parameters** (extending `PaginationDto`)

| Param | Type | Notes |
| ----- | ---- | ----- |
| `page` | `int >= 1` | default `1` |
| `limit` | `int 1..200` | default `25` |
| `search` | `string` | ILIKE on `roleTitle`, `jobTitle`, `companyName`, `notes`, `location` |
| `status` | `ApplicationStatus[]` | comma list or repeated query param |
| `stage` | `ApplicationStage[]` | comma list or repeated query param |
| `position` | `string[]` | matches the configured vocabulary |
| `method` | `string[]` | matches the configured vocabulary |
| `workMode` | `WorkMode[]` | comma list or repeated query param |
| `priority` | `Priority[]` | comma list or repeated query param |
| `companyName` | `string` | ILIKE |
| `tags` | `string[]` | `hasSome` semantics |
| `fromDate` | `YYYY-MM-DD` | inclusive on `applicationDate` |
| `toDate` | `YYYY-MM-DD` | inclusive on `applicationDate` |
| `onlyActive` | `boolean` | shortcut for `status ∈ ACTIVE_STATUSES` |
| `includeArchived` | `boolean` | default `false` (archived rows hidden) |
| `sortBy` | `applicationDate \| createdAt \| updatedAt \| status \| priority \| lastActivityAt` | default `applicationDate` |
| `sortDir` | `asc \| desc` | default `desc` |

The secondary sort is always `createdAt desc` to keep results stable across
pages.

**Response**

```jsonc
{
  "data": [
    { "id": "…", "companyName": "Acme", "status": "applied", … }
  ],
  "meta": { "total": 42, "page": 1, "limit": 25, "totalPages": 2 }
}
```

### 1.3 `GET /applications/:id`

Returns the full `JobApplication` with two related slices:

- `contacts: Contact[]` (full rows from `Contact`).
- `jobSearchSession: { id, queryTitle, platform, platformOther, searchedAt, isComplete } | null`.

`404` if `id` does not exist.

### 1.4 `PATCH /applications/:id`

Partial update. Status and stage are intentionally **not** accepted — use
`PATCH /applications/:id/status` so the timeline event is emitted alongside.

The DTO is `PartialType(OmitType(CreateApplicationDto, ['status','stage']))`.
Selector validation re-runs for any of `applicationMethod`, `position`,
`employmentType` that arrives in the payload.

`jobSearchSessionId` semantics:
- `string` → `connect: { id }` (existence checked, `404` otherwise).
- `null` → `disconnect: true` (clears the FK).
- omitted → unchanged.

### 1.5 `PATCH /applications/:id/status`

Transactional status/stage change. Inside one `prisma.$transaction(...)`:

1. Loads the row (`404` if missing).
2. Computes:
   - `newStage = dto.stage ?? defaultStageFor(newStatus)`.
   - `occurredAt = dto.occurredAt ?? new Date()`.
   - `lastActivityAt = occurredAt`.
   - If `isFirstResponseTransition(prev, new)` and `firstResponseAt` is null
     → set it to `occurredAt`.
   - If `isClosingTransition(new)` → set `closedAt = occurredAt`.
   - Else if `prev !== new` and `!isTerminalStatus(new)` → clear `closedAt`
     (reopening a terminal application).
3. Updates the application.
4. Inserts an `ApplicationEvent` with `type` derived from the new status:
   - `OFFER → offer_received`
   - `ACCEPTED → offer_accepted`
   - `NEGOTIATING → offer_negotiated`
   - `REJECTED → rejected`
   - `WITHDRAWN → withdrawn`
   - `GHOSTED → ghosted_marked`
   - everything else → `status_changed`
5. `metadata` carries `{ previousStatus, previousStage, ...(dto.metadata ?? {}) }`.

**Body**

```jsonc
{
  "status": "screening",                  // required
  "stage": "recruiter_screen",            // optional, defaults via resolver
  "title": "Recruiter call scheduled",    // optional, ≤ 250
  "description": "30 min intro chat",     // optional
  "channel": "video_call",                // optional EventChannel
  "occurredAt": "2026-05-06T10:00:00Z",   // optional ISO 8601
  "metadata": { "agency": "X" }           // optional, merged into event metadata
}
```

### 1.6 `PATCH /applications/:id/contacts`

Replaces the linked contact set (Prisma `set` semantics).

```jsonc
{ "contactIds": ["uuid-1", "uuid-2"] }   // each must be a UUID
```

Returns the updated application with `contacts: Contact[]`.

### 1.7 `PATCH /applications/:id/archive` / `restore`

- `archive` sets `archivedAt = new Date()`.
- `restore` sets `archivedAt = null`.
- Both throw `404 NotFoundException` when the row is missing.

Listing without `includeArchived=true` hides archived rows.

### 1.8 `POST /applications/mark-stale-ghosted?days=N`

Bulk auto-ghost. With `days` defaulting to `21`:

1. Loads all applications with `status ∈ {applied, acknowledged}`.
2. Computes `ref = lastActivityAt ?? applicationDate` for each.
3. If `ref < now - days days`, replays
   `changeStatus({ status: 'ghosted', stage: 'closed', title: 'Auto-marked as ghosted', description: 'No activity for more than {N} days' })`.
4. Returns `{ "ghostedCount": <number> }`.

Each replay is a separate transaction, so each emits a `ghosted_marked` event
on its timeline and respects the closing transition rules.

### 1.9 `DELETE /applications/:id`

Hard delete. `204 No Content`. `ApplicationEvent` rows cascade
(`onDelete: Cascade`). Contact rows are unaffected (m:n pivot rows are
deleted via the implicit pivot).

---

## 2. Application events

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/events` | Create an event (bumps `lastActivityAt` and conditionally `firstResponseAt`). |
| `GET` | `/applications/:applicationId/events` | Timeline (sorted `occurredAt desc`). |
| `GET` | `/events/:id` | Single event by id. |
| `DELETE` | `/events/:id` | Delete an event. `204 No Content`. |

### 2.1 `POST /events`

Inside a `prisma.$transaction(...)`:

1. Looks up the parent application (`404` if missing).
2. Computes `occurredAt = dto.occurredAt ?? new Date()`.
3. Updates `lastActivityAt = occurredAt`. Sets `firstResponseAt = occurredAt`
   only if it was null **and** `dto.type` belongs to:
   `{ MESSAGE_RECEIVED, EMAIL_RECEIVED, INTERVIEW_SCHEDULED,
   ASSESSMENT_ASSIGNED, FEEDBACK_RECEIVED, OFFER_RECEIVED }`.
4. Inserts the event row.

**Body**

```jsonc
{
  "applicationId": "uuid",                        // required
  "type": "interview_scheduled",                  // required, ApplicationEventType
  "title": "Tech screen with hiring manager",     // required, ≤ 250
  "description": "60 min, system design",         // optional
  "channel": "video_call",                        // optional, EventChannel
  "newStatus": "interview",                       // optional
  "newStage": "tech_interview_1",                 // optional
  "occurredAt": "2026-05-09T16:00:00Z",           // optional ISO 8601
  "metadata": { "interviewer": "Jane" }           // optional
}
```

> Tip: prefer `PATCH /applications/:id/status` when you actually want the
> status to change. `POST /events` is for *log entries* — notes, sent
> emails, received messages, scheduled interviews — without mutating the
> macro status.

### 2.2 `GET /applications/:applicationId/events`

Returns `ApplicationEvent[]` ordered by `occurredAt desc`.

### 2.3 `DELETE /events/:id`

Hard delete. `204 No Content`. `P2025 → 404 NotFoundException`.

---

## 3. Contacts — `/api/contacts`

Standard CRUD + search.

| Method | Path | Notes |
| ------ | ---- | ----- |
| `POST` | `/contacts` | `companyName` is trimmed. |
| `GET`  | `/contacts` | Paginated. Filters: `search` (ILIKE on name/email/title/companyName), `role`, `companyName`. Order: `name asc`. |
| `GET`  | `/contacts/:id` | `404` if missing. |
| `PATCH`| `/contacts/:id` | Partial update. `companyName.trim()` if present. |
| `DELETE`| `/contacts/:id` | `204 No Content`. |

Body shape (`CreateContactDto`):

```jsonc
{
  "name": "Ada Lovelace",         // required, ≤ 200
  "title": "Recruiter",            // optional, ≤ 200
  "role": "recruiter",             // ContactRole — recruiter|hiring_manager|engineer|referral|other
  "email": "ada@acme.com",         // optional, must be email
  "phone": "+1 555 0123",          // optional, ≤ 50
  "linkedinUrl": "https://…",      // optional, ≤ 500
  "notes": "Met at conference X",  // optional
  "companyName": "Acme"            // optional, ≤ 200, trimmed
}
```

`UpdateContactDto = PartialType(CreateContactDto)`.

---

## 4. Search sessions — `/api/search-sessions`

A `JobSearchSession` is a logged search (platform + query + filters + posting
window) used as the parent of multiple `JobApplication` rows it produced.

| Method | Path | Notes |
| ------ | ---- | ----- |
| `POST` | `/search-sessions` | Validates `platform` against `formConfig`. `platformOther` only persists when `platform === 'other'`. |
| `GET`  | `/search-sessions` | Paginated. Filters: `search` (ILIKE on `queryTitle`, `filterDescription`, `notes`, `platformOther`), `platform`, `fromDate`/`toDate`. Order: `searchedAt desc`. |
| `GET`  | `/search-sessions/:id` | Detail with `_count.applications`. |
| `PATCH`| `/search-sessions/:id` | Partial. If `platform` changes to anything other than `other`, `platformOther` is cleared. |
| `DELETE`| `/search-sessions/:id` | `204 No Content`. Linked applications keep `jobSearchSessionId = null` (`onDelete: SetNull`). |

`POST /search-sessions` body:

```jsonc
{
  "platform": "linkedin",                              // required (vocabulary)
  "platformOther": "Stack Overflow Jobs",              // only if platform === 'other'
  "queryTitle": "Node.js Backend Engineer",            // required, ≤ 250
  "filterDescription": "remote, last 7 days, USD",     // optional
  "jobPostedFrom": "2026-05-01",                       // optional, default = day of searchedAt
  "searchedAt": "2026-05-06T15:00:00Z",                // optional, default = now
  "resultsApproxCount": 432,                           // optional, 0..500000
  "isComplete": false,                                 // optional, default false
  "searchUrl": "https://linkedin.com/…",               // optional, ≤ 1000
  "notes": "Saved for follow-up"                       // optional
}
```

**Defaults**:
- `searchedAt` → `new Date()`.
- `jobPostedFrom` → calendar day of `searchedAt` (UTC).

**`platformOther` rules**:
- Only stored when `platform === 'other'`.
- Trimmed.
- On update, switching `platform` away from `'other'` always sets
  `platformOther = null`.

---

## 5. Templates — `/api/templates`

| Method | Path | Notes |
| ------ | ---- | ----- |
| `POST` | `/templates` | Creates a template (defaults: `tags: []`, `isFavorite: false`). |
| `GET`  | `/templates` | Paginated. Filters: `search` (ILIKE on `name`, `subject`, `body`), `type`, `favoritesOnly`, `language`. Order: `isFavorite desc, usageCount desc, updatedAt desc`. |
| `GET`  | `/templates/:id` | `404` if missing. |
| `PATCH`| `/templates/:id` | Partial update. |
| `PATCH`| `/templates/:id/favorite` | Toggle `isFavorite`. |
| `PATCH`| `/templates/:id/used` | Increment `usageCount` and refresh `lastUsedAt`. SPA calls this on copy. |
| `DELETE`| `/templates/:id` | `204 No Content`. |

`POST /templates` body:

```jsonc
{
  "name": "Generic cover letter - Backend (EN)",       // required, ≤ 200
  "type": "cover_letter",                              // required, TemplateType
  "subject": "Application for {{role}} at {{company}}",// optional, ≤ 250
  "body": "Hi {{company}} team, …",                    // required
  "language": "en",                                    // optional, ≤ 50
  "tags": ["backend", "cover_letter"],                 // optional
  "isFavorite": true                                   // optional
}
```

Templates support `{{handlebars}}`-style placeholders by convention only —
the backend stores the raw string. The seed (`backend/src/database/seed.ts`)
ships with 12 templates (6 EN + 6 ES).

---

## 6. Dashboard — `/api/dashboard`

Both endpoints accept `fromDate` / `toDate` (`YYYY-MM-DD`). Both ignore the
hour part (the range is normalized to start of day UTC and end of day UTC).

| Method | Path | Output |
| ------ | ---- | ------ |
| `GET` | `/dashboard` | `DashboardOverview` — pipeline. Excludes archived. |
| `GET` | `/dashboard/search-activity` | `SearchActivityOverview` — over `JobSearchSession`. |

### 6.1 `GET /dashboard`

```ts
interface DashboardOverview {
  kpis: {
    total: number;
    active: number;
    responded: number;       // firstResponseAt OR funnelIndex(status) >= funnelIndex(screening)
    interviewing: number;    // status ∈ { interview, offer, negotiating, accepted }
    offers: number;          // status ∈ { offer, negotiating, accepted }
    accepted: number;
    rejected: number;
    ghosted: number;
    responseRate: number;    // responded/total · 100, 1 decimal
    interviewRate: number;
    offerRate: number;
    acceptanceRate: number;
    avgDaysToFirstResponse: number | null;
    avgDaysToOffer: number | null;
  };
  byStatus: Array<{ key: ApplicationStatus; count: number; percentage: number }>;
  byPosition: Array<{ key: string; count: number; percentage: number }>;
  byMethod: Array<{ key: string; count: number; percentage: number }>;
  byWorkMode: Array<{ key: WorkMode; count: number; percentage: number }>;
  funnel: Array<{
    status: ApplicationStatus;             // FUNNEL_ORDER positions
    count: number;
    conversionFromPrev: number | null;     // null on the first step
    conversionFromTop: number;
  }>;
  applicationsPerDay: Array<{ date: string; count: number }>;
  activityHeatmap: Array<{ weekday: number; hour: number; count: number }>;
  methodEffectiveness: Array<{
    method: string;
    total: number;
    responseRate: number;
    interviewRate: number;
    offerRate: number;
  }>;
  topCompanies: Array<{ companyName: string; applicationsCount: number; activeCount: number }>;
  upcomingFollowUps: number;               // active rows with lastActivityAt ?? applicationDate older than 7d
}
```

Notes:

- `activityHeatmap` runs `$queryRaw` over `application_events`, grouping by
  `EXTRACT(DOW FROM occurred_at)` (`0..6` — Sunday-based) and
  `EXTRACT(HOUR FROM occurred_at)` (`0..23`). It covers **all** event types,
  not just submissions.
- `topCompanies` normalizes the company name to `trim().toLowerCase()` for
  deduplication, but reports the first encountered original casing.
- All percentages use `Math.round(x * 10) / 10` (one decimal).
- `funnel` always returns the full `FUNNEL_ORDER` array (8 entries), even if
  some counts are zero.
- An application counts as **responded** if it has `firstResponseAt` **or**
  its current `status` is at or beyond `screening` in the funnel — so manual
  reclassifications without an event still count.

### 6.2 `GET /dashboard/search-activity`

```ts
interface SearchActivityOverview {
  totalSessions: number;
  linkedApplicationsCount: number;        // Σ _count.applications
  byPlatform: Array<{ key: string; count: number; percentage: number }>;
  byCompletion: Array<{ key: 'complete' | 'active'; count: number; percentage: number }>;
  searchesPerDay: Array<{ date: string; count: number }>;
  topQueries: Array<{ queryTitle: string; count: number }>; // top 15
  recentSessions: Array<{
    id: string;
    platform: string;
    platformOther: string | null;
    queryTitle: string;
    searchedAt: string;
    isComplete: boolean;
    applicationsCount: number;
    filterDescription: string | null;
    jobPostedFrom: string;
    resultsApproxCount: number | null;
  }>; // latest 20
}
```

`topQueries` deduplicates by lowercase trimmed `queryTitle`, but reports the
first observed casing. `recentSessions[i].applicationsCount` comes from
`_count.applications` (no n+1).

---

## 7. Platform settings — `/api/platform-settings`

Single-row settings store (`id = "default"`).

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/platform-settings` | Returns the row. **Creates it** on first call (`themeId: ocean`, `appearanceMode: dark`, `formConfig: {}`). |
| `PATCH` | `/platform-settings` | Partial update. Validates `themeId`, `appearanceMode`, `formConfig`. |

**Body** (`UpdatePlatformSettingsDto` — every field is optional):

```jsonc
{
  "themeId": "emerald",                    // ocean|sky|indigo|violet|fuchsia|rose|coral|terracotta|amber|lime|emerald|slate
  "appearanceMode": "dim",                 // dark|night|dim|mist|soft|light
  "formConfig": {
    "customApplicationMethods": ["x_recruiter"],
    "applicationMethodLabels": { "linkedin_easy_apply": "LinkedIn (Easy Apply)" },
    "applicationMethodOrder": [             // FULL permutation of built-in ∪ custom
      "linkedin_easy_apply", "email", "linkedin_external", "company_website",
      "job_board", "referral", "recruiter_outreach", "other", "x_recruiter"
    ],
    "applicationMethodHidden": ["job_board"],
    "workModeLabels": { "remote": "Fully remote" },
    "customPositionTypes": ["devops"],
    "positionLabels": { "ai_developer": "AI Engineer" },
    "positionOrder": ["fullstack", "backend", "ai_developer", "devops"],
    "positionHidden": [],
    "customEmploymentTypes": [],
    "employmentLabels": {},
    "employmentOrder": ["full_time", "part_time", "contract", "internship", "freelance"],
    "employmentHidden": [],
    "customSearchPlatforms": ["wellfound"],
    "searchPlatformLabels": {},
    "searchPlatformOrder": [
      "linkedin", "google", "indeed", "glassdoor", "job_board",
      "company_site", "recruiter_portal", "other", "wellfound"
    ],
    "searchPlatformHidden": [],
    "roleTitleOptions": ["Junior", "SSR", "Senior"],
    "resumeVersionOptions": ["English version", "Spanish version"]
  }
}
```

### 7.1 `formConfig` validation

`PlatformSettingsService.assertValidFormConfig` enforces all of:

- **Custom slugs** (`customApplicationMethods`, `customPositionTypes`,
  `customEmploymentTypes`, `customSearchPlatforms`):
  - regex `^[a-z][a-z0-9_]{0,47}$` (≤ 48 chars).
  - Must not collide with the corresponding built-in enum values.
  - No duplicates within an array.
- **Orders** (`*Order`): if present, **must be a full permutation** of the
  universe `built-in ∪ custom` (same length, no duplicates, no unknowns).
  Partial orders are rejected.
- **Hidden** (`*Hidden`): subset of the universe.
- **Labels** (`*Labels`): keys must be members of the universe.
- `workModeLabels` keys must be members of the strict `WorkMode` enum
  (no custom slugs allowed for work mode).
- `roleTitleOptions`: ≤ 80 entries, each ≤ 200 chars.
- `resumeVersionOptions`: ≤ 40 entries, each ≤ 120 chars.

Any failure raises `400 BadRequestException` with a precise message
(e.g. `applicationMethodOrder must list each option exactly once (9 total)`).

### 7.2 Why selectors are validated on every write

Both `ApplicationsService.create/update` and
`SearchSessionsService.create/update` re-validate the relevant selector
fields (`applicationMethod`, `position`, `employmentType`, `platform`)
against the **current** `formConfig`. If you remove a custom slug from
Settings, **existing rows keep it** (you can still read them), but you
**cannot create new rows** with that value. This avoids historical data
loss while preventing the vocabulary from drifting.

---

## 8. Cross-cutting

### 8.1 Errors

| HTTP | Cause | Notes |
| ---- | ----- | ----- |
| `400` | `ValidationPipe` failure, `BadRequestException` thrown by services. | `message` is a `string[]`. |
| `403` | Reserved for future auth. The current code never raises `403`. | — |
| `404` | `NotFoundException` thrown by services or Prisma `P2025` translated by services. | `message: "<Resource> <id> not found"`. |
| `415` | Wrong `Content-Type` on a body-bearing request. | Sent by `body-parser`. |
| `500` | Anything else. Stack trace logged on the backend. | `message` is the original `Error.message`. |

### 8.2 Pagination shortcut

Lists accept either `?status=applied&status=screening` or
`?status=applied,screening`. Both are normalized to `string[]` by the DTO's
`@Transform(({ value }) => toArray<…>(value))`.

### 8.3 Date / time formats

- **Date-only** fields (`applicationDate`, `vacancyPostedDate`,
  `jobPostedFrom`, `fromDate`, `toDate`) accept and return `YYYY-MM-DD`.
  Internally they are normalized to `T00:00:00.000Z`.
- **Date-time** fields (`searchedAt`, `occurredAt`, `firstResponseAt`,
  `lastActivityAt`, `closedAt`, `archivedAt`, `createdAt`, `updatedAt`)
  use ISO 8601 with timezone (`Timestamptz(6)` in Postgres).

### 8.4 Decimals

`salaryMin` / `salaryMax` are stored as `Decimal(12,2)` and serialized as
**strings** by Prisma. The frontend formats them via
`Intl.NumberFormat('en-US')` and `formatSalaryRange(...)`.

---

## 9. Postman collection

A ready-to-import collection covering 100% of the endpoints documented above
lives at [`./postman-collection.json`](./postman-collection.json). It uses two
collection variables — `baseUrl` (default `http://localhost:3001/api`) and
`applicationId` (placeholder) — and is grouped by resource.

Import via:

- **Postman Desktop**: *File → Import → Upload* `docs/postman-collection.json`.
- **Insomnia**: *Application → Preferences → Data → Import* and pick
  `docs/postman-collection.json` (Insomnia auto-detects Postman v2.1).
- **Bruno**: *Collection → Import* with the same file.
