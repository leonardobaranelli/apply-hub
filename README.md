# ApplyHub

A personal, full‑stack control center for a developer's job search. ApplyHub treats every application as a first‑class entity with status, stage, timeline, contacts and the search session that produced it, so the lifecycle of each opportunity — and the patterns across all of them — stay queryable from one place.

## What it solves

Job searching produces a lot of short‑lived context: an open posting tab, a recruiter message, a follow‑up TODO, a resume version, the search filters that surfaced the role. ApplyHub captures that context as data:

- Every application has a typed **status** (applied → screening → interview → offer → accepted, with branches to rejected/ghosted/on_hold) and a finer **stage** (recruiter screen, take‑home, system design, …).
- Every status or stage change is recorded as an immutable **event** in the application timeline.
- Every search you run can be logged as a **session** (platform, query, filters, posted‑from window, completion) and linked to the applications it produced, so analytics cover both the pipeline and the activity that feeds it.
- Cross‑cutting selector vocabularies (application method, position type, employment type, search platform, role title, resume version) live in a single **platform settings** document that the UI reads at runtime — vocabulary changes never require code changes.

## Domain model

Six aggregates, defined in `backend/prisma/schema.prisma`:

| Aggregate          | Purpose |
| ------------------ | ------- |
| `JobApplication`   | One opportunity. Owns status/stage/priority, salary band, denormalized vacancy contact, optional link to a search session. |
| `JobSearchSession` | A logged search (platform, query, filters, posted‑from window). Aggregates the applications produced from it. |
| `ApplicationEvent` | Append‑only audit of every status/stage change, message, interview, note. Drives the timeline view. |
| `Contact`          | Reusable people (recruiters, hiring managers, referrals) attachable to many applications. |
| `Template`         | Reusable copy (cover letters, follow‑ups, outreach) with usage stats and favorites. |
| `PlatformSettings` | Single‑row configuration: appearance, color preset, custom selector vocabularies. |

Status transitions and derived fields (`firstResponseAt`, `lastActivityAt`, `closedAt`, `archivedAt`) are owned by a status resolver under `applications/domain/`, not scattered across controllers.

## Stack

- **API**: NestJS 10, Prisma 5, PostgreSQL 16, class‑validator, Swagger.
- **Web**: React 18 + Vite, TypeScript, TanStack Query, React Hook Form + Zod, Tailwind CSS, Recharts.
- **Infra**: Docker Compose for local Postgres + API + web; multi‑stage Dockerfiles with `development` and `production` targets.

## Repository layout

```
apply-hub/
├── backend/
│   ├── prisma/                 # schema.prisma, seed
│   ├── scripts/                # db sync + replica tooling
│   └── src/
│       ├── common/             # filters, shared dto, infra utilities
│       ├── config/             # env loading + validation
│       ├── database/           # Prisma module, replica write‑mirror
│       └── modules/
│           ├── applications/        # controller / service / dto / domain
│           ├── application-events/
│           ├── contacts/
│           ├── dashboard/
│           ├── platform-settings/
│           ├── search-sessions/
│           └── templates/
├── frontend/
│   └── src/
│       ├── api/                # typed axios clients
│       ├── components/         # ui + feature components
│       ├── context/            # platform settings provider
│       ├── hooks/              # query / mutation hooks
│       ├── lib/                # query client, theme, helpers
│       ├── pages/              # routed pages
│       └── types/              # shared models, enums, labels
├── docker-compose.yml
└── .env.example
```

Each backend module follows the same shape: `controller → service → dto → domain`. Persistence is owned by the service. Cross‑module rules (e.g. validating a custom selector slug against `PlatformSettings`) are pulled in via injected services, never duplicated.

## API

OpenAPI is exposed at `http://localhost:3001/api/docs` once the backend is running.

| Resource             | Paths                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| Applications         | `/applications`, `/applications/:id`, `/applications/:id/status`      |
| Application events   | `/applications/:id/events`                                            |
| Search sessions      | `/search-sessions`, `/search-sessions/:id`                            |
| Contacts             | `/contacts`, `/contacts/:id`                                          |
| Templates            | `/templates`, `/templates/:id`                                        |
| Dashboard            | `/dashboard`, `/dashboard/search-activity`                            |
| Platform settings    | `/platform-settings`                                                  |

All list endpoints accept pagination, search and filter query parameters; payloads are validated by class‑validator DTOs and mirrored on the client by Zod schemas.

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

The backend container generates the Prisma client, runs `prisma db push`, and starts Nest in watch mode. Default endpoints:

- Web: `http://localhost:5173`
- API: `http://localhost:3001/api`
- Swagger: `http://localhost:3001/api/docs`
- Postgres: `localhost:5432`

## Local development without Docker

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

## Configuration

| Variable               | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`         | Primary Postgres connection (required).                            |
| `DATABASE_URL_REPLICA` | Optional secondary Postgres for write mirroring.                   |
| `DATABASE_LOGGING`     | Enable Prisma query logs.                                          |
| `BACKEND_PORT`         | API port (default `3001`).                                         |
| `CORS_ORIGIN`          | Allowed origin for the web app (default `http://localhost:5173`).  |
| `FRONTEND_PORT`        | Vite dev server port (default `5173`).                             |
| `VITE_API_URL`         | Base URL the SPA calls (default `http://localhost:3001/api`).      |

`.env.example` ships defaults for the Docker setup; copy and adjust per environment.

## Backend scripts

Run from `backend/`:

- `npm run start:dev` — Nest in watch mode.
- `npm run build` / `npm run start:prod` — production build and run.
- `npm run prisma:generate` — regenerate the typed Prisma client.
- `npm run prisma:db:push` — apply schema without a migration (dev).
- `npm run prisma:migrate:dev` — create a versioned migration.
- `npm run prisma:migrate:deploy` — apply pending migrations (prod).
- `npm run prisma:studio` — open Prisma Studio against the primary.
- `npm run seed` — seed default templates.

## Replica / live backup

ApplyHub can mirror every successful write on the primary database to a secondary Postgres (typically a managed replica). Reads always go to the primary; the replica is updated asynchronously after each `create` / `update` / `delete`. The application is the source of truth — the replica exists for recovery, not failover.

### Enabling

1. Obtain the **external** URL of the secondary database (`?sslmode=require` if your provider requires it).
2. Set it in `.env`:
   ```env
   DATABASE_URL_REPLICA=postgresql://user:pass@replica-host:5432/db?sslmode=require
   ```
3. Apply the schema once:
   ```bash
   cd backend
   npm run prisma:db:push:replica
   ```
4. Restart the backend. You should see `Prisma connected (replica)` on startup.

### Day‑to‑day

```bash
# parity check between primary and replica
npm run db:status

# incremental reconciliation (upsert by id, only when source.updatedAt is newer)
npm run db:sync:incremental:local-to-replica
npm run db:sync:incremental:replica-to-local

# full snapshot (recovery or heavy drift) — pg_dump | psql in a one-off container
npm run db:sync:local-to-replica
npm run db:sync:replica-to-local
```

### Replica‑targeted utilities

- `npm run prisma:studio:replica`
- `npm run seed:replica`

### Caveats

- Replication is **eventually consistent**: if the replica is briefly unreachable, those writes need a manual reconciliation.
- To switch the app to the replica during a primary outage, swap `DATABASE_URL` to the replica URL and restart the backend.

## Operational notes

- Authentication is intentionally disabled. ApplyHub is designed as a single‑operator hub; deploy it behind a network boundary you control.
- Database migrations: use `prisma migrate dev` for new schema changes; `db push` is reserved for local iteration. The replica path mirrors writes only — schema changes must be applied to both databases.
- Logs: Prisma query logs are gated by `DATABASE_LOGGING`. The default Nest logger is used elsewhere.
