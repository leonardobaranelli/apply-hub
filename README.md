# ApplyHub

Personal full-stack hub to record, organize and analyze every job application you make as a developer. It's designed to be the control center of your job search: every application, every movement, every metric.

## Stack

- **Backend**: NestJS + Prisma + PostgreSQL + TypeScript (Clean Architecture, SOLID)
- **Frontend**: React + Vite + TailwindCSS + TypeScript (TanStack Query, React Hook Form + Zod, Recharts)
- **Infra**: Docker + docker-compose

## Structure

```
apply-hub/
├── backend/
│   ├── prisma/        # schema.prisma + migrations
│   └── src/           # NestJS app
├── frontend/          # React + Vite SPA
├── docker-compose.yml # Orchestration
└── .env.example       # Environment variables
```

## Key features

- **Flexible applications**: log any application (email, LinkedIn Easy Apply, company website, referrals, recruiter outreach, etc.).
- **Full status pipeline**: applied → screening → assessment → interview → offer → accepted, with branches to rejected/withdrawn/ghosted/on_hold.
- **Granular stages**: recruiter screen, take-home, tech interview 1/2, system design, behavioral, final round, etc.
- **Event timeline**: complete history of every movement (messages sent/received, interviews, feedback, notes).
- **Reusable contacts**: link contacts to multiple applications.
- **Templates**: cover letters, LinkedIn messages and follow-ups with one-click copy.
- **Analytical dashboard**: KPIs (response rate, interview rate, offer rate), conversion funnel, distributions, activity heatmap, top companies/platforms.
- **Job search sessions**: log each search (platform, query, date); sessions can be **active** or **complete**; the dashboard surfaces search activity. New job applications **default to the latest active session** so each application stays tied to the search context (you can change or clear the link in the form).

## Job search sessions

ApplyHub stores **job search sessions** (`JobSearchSession`): platform (LinkedIn, company site, other), optional platform label, query or title, when you searched, and whether the session is marked **complete** or still **active**.

- Create and review sessions from the app (including **Search activity** on the dashboard).
- Each **job application** may reference a session via `jobSearchSessionId`. On **New application**, the form preselects the **most recent active** session (sorted by `searchedAt`), or **None** if there is no active session.

## Application form & data model

- **Vacancy posted date** — when the listing was published; stored on `JobApplication` (`vacancy_posted_date`). On create it defaults to **today**, same idea as **Application date** (and falls back to the application date when editing older records without a stored value).
- **Salary period** — free text; **new** applications default to **Indefinite** (English), sent to the API as a normal value (not treated as an “unspecified” placeholder).
- **Excitement** (1–5) has been **removed** from the schema and UI.
- **Role title** (preset list): display order is Junior → Junior Advanced → Junior Advanced/SSR → SSR → Senior; the default selection remains **Junior Advanced/SSR**.

After pulling schema changes, run `npx prisma db push` (or create a migration). The Docker backend startup path already runs `prisma generate` and `db push` so local containers stay in sync.

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

The backend container automatically:
1. Generates the Prisma client.
2. Runs `prisma db push` to apply the schema.
3. Starts NestJS in watch mode.

- Frontend: http://localhost:5173
- Backend (API): http://localhost:3001/api
- API docs (Swagger): http://localhost:3001/api/docs
- Postgres: localhost:5432

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

## Useful scripts

Inside `backend/`:

- `npm run prisma:generate` — regenerate Prisma client after schema changes.
- `npm run prisma:db:push` — push schema to the DB without creating a migration (dev).
- `npm run prisma:migrate:dev` — create a versioned migration.
- `npm run prisma:studio` — open Prisma Studio (from your PC it rewrites `postgres` → `127.0.0.1` using `POSTGRES_PORT`; inside a container it leaves the URL as-is).
- `npm run seed` — seed default templates.
- `npm run lint` / `npm run build` — quality checks.

## Replica / live backup database

ApplyHub can mirror every successful write on the primary database to a
secondary one (e.g. a managed Postgres replica) so you always have a hot
standby. Reads always go to the primary; the replica is updated
asynchronously after each `create` / `update` / `delete`.

### Current status 

- **Primary DB**: local Postgres (`DATABASE_URL`).
- **Secondary DB**: replica Postgres (`DATABASE_URL_REPLICA`).
- **Normal work**: app writes to local and mirrors to the replica automatically.
- **Validation**: tested end-to-end (auto mirror + local->replica + replica->local).
- **Fast checks**: run `npm run db:status` inside `backend` to confirm parity.

### Command cheat sheet (all key commands)

Run from `backend/` unless stated otherwise:

```bash
# 1) Bring services up (from repo root)
docker compose up -d postgres backend

# 2) Check local vs replica parity
docker compose exec backend npm run db:status

# 3) Normal/fast sync (incremental, recommended day-to-day)
docker compose exec backend npm run db:sync:incremental:local-to-replica
docker compose exec backend npm run db:sync:incremental:replica-to-local

# 4) Full snapshot sync (recovery / heavy drift)
npm --prefix backend run db:sync:local-to-replica
npm --prefix backend run db:sync:replica-to-local

# 5) Replica schema + seed (one-time or when needed)
docker compose exec backend npm run prisma:db:push:replica
docker compose exec backend npm run seed:replica

# 6) Open Prisma Studio on replica
docker compose exec backend npm run prisma:studio:replica
```

### How to enable it

1. Get the **External Database URL** from your provider dashboard
   (avoid internal/private URLs that only work inside hosted networks).
2. Set `DATABASE_URL_REPLICA` in `.env`, appending `?sslmode=require`:
   ```env
   DATABASE_URL_REPLICA=postgresql://user:pass@your-replica-host:5432/db?sslmode=require
   ```
3. Push the schema to the replica (one-time):
   ```bash
   cd backend
   npm run prisma:db:push:replica
   ```
4. (Optional) Copy existing data over once:
   ```bash
   npm run db:sync:local-to-replica
   ```
5. Restart the backend (`docker compose up -d --build backend`).
   On startup you should see `Prisma connected (replica)` in the logs.

From now on every write made through the app is replicated automatically.

### Manual reconciliation

If the replica falls out of sync (e.g. it was unreachable for a while), you
can do a full data refresh in either direction:

```bash
cd backend
npm run db:sync:local-to-replica    # push local snapshot to replica
npm run db:sync:replica-to-local    # restore from replica to local
```

These scripts run `pg_dump | psql` inside a one-off `postgres:18-alpine`
container, so you don't need PostgreSQL client tools installed on your host.

### Incremental reconciliation (faster day-to-day)

For regular syncs, you can run an incremental mode that:

- upserts by `id`,
- only updates when source `updatedAt` is newer than target,
- inserts missing rows in the application-contact pivot table.

```bash
cd backend
npm run db:sync:incremental:local-to-replica
npm run db:sync:incremental:replica-to-local
```

Use this for frequent syncs. Keep full snapshot sync for disaster recovery
or when you suspect heavy drift.

### Other replica-targeted scripts

- `npm run prisma:studio:replica` — Prisma Studio against the replica database.
- `npm run seed:replica` — seed default templates into the replica database.

### Caveats

- Replication is **eventually consistent** (fire-and-forget after the local
  write succeeds). If the replica is briefly unreachable, those writes will
  be missing until you run `db:sync:local-to-replica`.
- The primary is always the source of truth. To switch the app to the
  replica during a local outage, swap `DATABASE_URL` to the replica URL and
  restart the backend.

> Authentication is intentionally disabled — this is meant to run locally as a personal tool.
