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
- `npm run prisma:studio` — open Prisma Studio.
- `npm run seed` — seed default templates.
- `npm run lint` / `npm run build` — quality checks.

## Replica / live backup database

ApplyHub can mirror every successful write on the primary database to a
secondary one (e.g. a Render-hosted Postgres) so you always have a hot
standby. Reads always go to the primary; the replica is updated
asynchronously after each `create` / `update` / `delete`.

### Current status 

- **Primary DB**: local Postgres (`DATABASE_URL`).
- **Secondary DB**: Render Postgres (`DATABASE_URL_REPLICA`).
- **Normal work**: app writes to local and mirrors to Render automatically.
- **Validation**: tested end-to-end (auto mirror + local->render + render->local).
- **Fast checks**: run `npm run db:status` inside `backend` to confirm parity.

### Command cheat sheet (all key commands)

Run from `backend/` unless stated otherwise:

```bash
# 1) Bring services up (from repo root)
docker compose up -d postgres backend

# 2) Check local vs Render parity
docker compose exec backend npm run db:status

# 3) Normal/fast sync (incremental, recommended day-to-day)
docker compose exec backend npm run db:sync:incremental:local-to-render
docker compose exec backend npm run db:sync:incremental:render-to-local

# 4) Full snapshot sync (recovery / heavy drift)
npm --prefix backend run db:sync:local-to-render
npm --prefix backend run db:sync:render-to-local

# 5) Render schema + seed (one-time or when needed)
docker compose exec backend npm run prisma:db:push:render
docker compose exec backend npm run seed:render

# 6) Open Prisma Studio on Render
docker compose exec backend npm run prisma:studio:render
```

### How to enable it

1. Get the **External Database URL** from your Render dashboard:
   `Database → Connect → External Database URL`. It must end with
   `.<region>-postgres.render.com/<db>` (the *internal* URL won't work from
   your machine).
2. Set `DATABASE_URL_REPLICA` in `.env`, appending `?sslmode=require`:
   ```env
   DATABASE_URL_REPLICA=postgresql://user:pass@dpg-XXX-a.virginia-postgres.render.com/db?sslmode=require
   ```
3. Push the schema to the replica (one-time):
   ```bash
   cd backend
   npm run prisma:db:push:render
   ```
4. (Optional) Copy existing data over once:
   ```bash
   npm run db:sync:local-to-render
   ```
5. Restart the backend (`docker compose up -d --build backend`).
   On startup you should see `Prisma connected (replica)` in the logs.

From now on every write made through the app is replicated automatically.

### Manual reconciliation

If the replica falls out of sync (e.g. it was unreachable for a while), you
can do a full data refresh in either direction:

```bash
cd backend
npm run db:sync:local-to-render    # push local snapshot to Render
npm run db:sync:render-to-local    # restore from Render to local
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
npm run db:sync:incremental:local-to-render
npm run db:sync:incremental:render-to-local
```

Use this for frequent syncs. Keep full snapshot sync for disaster recovery
or when you suspect heavy drift.

### Other replica-targeted scripts

- `npm run prisma:studio:render` — Prisma Studio against the Render database.
- `npm run seed:render` — seed default templates into the Render database.

### Caveats

- Replication is **eventually consistent** (fire-and-forget after the local
  write succeeds). If the replica is briefly unreachable, those writes will
  be missing until you run `db:sync:local-to-render`.
- The primary is always the source of truth. To switch the app to the
  replica during a local outage, swap `DATABASE_URL` to the replica URL and
  restart the backend.

> Authentication is intentionally disabled — this is meant to run locally as a personal tool.
