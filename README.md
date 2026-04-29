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

> Authentication is intentionally disabled — this is meant to run locally as a personal tool.
