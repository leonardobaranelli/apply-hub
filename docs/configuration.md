# Configuration

> Every runtime knob lives in environment variables, validated at boot via
> `Joi`. The repo ships a complete [`/.env.example`](../.env.example) at
> the root.

For deploy/runbook concerns see [`operations.md`](./operations.md).

---

## 1. Source of truth

- Variables are loaded by `@nestjs/config` (`isGlobal: true`,
  `cache: true`) inside `AppModule`. `ConfigModule.forRoot` runs the Joi
  schema in `backend/src/config/validation.schema.ts` and the typed factory
  in `backend/src/config/configuration.ts`.
- Code consumes config through `ConfigService<AppConfig, true>` —
  **never** through `process.env` directly. The single exception is
  `PrismaClient`, which Prisma reads from `DATABASE_URL` itself.
- `docker-compose.yml` exposes the same variables to the `backend` and
  `frontend` containers with `${VAR:-default}` fallbacks.

---

## 2. Variable matrix

| Variable | Required | Default | Validation | Consumed by |
| -------- | -------- | ------- | ---------- | ----------- |
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` | Nest, `main.ts` (Swagger gate). |
| `PORT` | no | `3001` | number | `main.ts` (`app.listen`). |
| `BACKEND_PORT` | compose only | `3001` | number | docker-compose port mapping. |
| `CORS_ORIGIN` | no | `http://localhost:5173` | string | `main.ts` (`app.enableCors`). |
| `DATABASE_URL` | **yes** | — | postgresql/postgres URI | Prisma primary. |
| `DATABASE_URL_REPLICA` | no | `null` | postgresql/postgres URI \| empty | `PrismaService` mirror client. |
| `DATABASE_LOGGING` | no | `false` | boolean | Prisma `log` (`['query','info','warn','error']` if true; `['error']` if false). |
| `POSTGRES_USER` | compose only | `applyhub` | string | `postgres` service in compose. |
| `POSTGRES_PASSWORD` | compose only | `applyhub_dev` | string | `postgres` service in compose. |
| `POSTGRES_DB` | compose only | `applyhub` | string | `postgres` service in compose. |
| `POSTGRES_PORT` | compose only | `5432` | number | host-published Postgres port. |
| `FRONTEND_PORT` | compose only | `5173` | number | docker-compose port mapping. |
| `VITE_API_URL` | frontend build | `http://localhost:3001/api` | URL | baked into the SPA build at `import.meta.env.VITE_API_URL`. |
| `DOCKER_NETWORK` | scripts only | `apply-hub_default` | string | `db-sync.mjs` to attach the temporary `pg_dump` container. |

`abortEarly: true` in the Joi schema means the first invalid value will
crash the boot — by design.

---

## 3. `.env` lifecycle

- `.env` is git-ignored. Copy `.env.example` once and adjust.
- Variables are read at three different layers:
  1. **Docker Compose** for the postgres / backend / frontend services.
  2. **`@nestjs/config`** at backend boot (validates and freezes config).
  3. **Vite** at frontend build (`VITE_*` only). Anything not prefixed
     `VITE_` is invisible to the SPA — by design.
- The maintenance scripts in `backend/scripts/` parse `.env` themselves
  with a small `parseEnvFile` helper because they may run outside Docker.
  Order of precedence: actual environment > `.env` file > script defaults.

---

## 4. Replica considerations

- `DATABASE_URL_REPLICA` may be empty. When empty:
  - `PrismaService` skips the secondary client setup entirely.
  - Replication middleware is **not** installed.
  - The primary path is unaffected.
- When set, **the replica must already exist with the right schema**.
  Apply schema changes to both primary and replica:

  ```bash
  npm run prisma:db:push                # primary
  npm run prisma:db:push:replica        # replica via run-on-replica.mjs
  ```

  Or, in production:

  ```bash
  npm run prisma:migrate:deploy
  npm run prisma:migrate:deploy --workspace=... # equivalent for replica via run-on-replica
  ```

- The replica URL **may** carry `sslmode=require` (managed Postgres). Both
  the runtime mirror client and the maintenance scripts respect arbitrary
  query strings.

See [`operations.md`](./operations.md#3-replica-runbook) for the runbook.

---

## 5. Ports and networking

| Service | Internal port | Default host port | Notes |
| ------- | ------------- | ----------------- | ----- |
| `postgres` | 5432 | 5432 (`POSTGRES_PORT`) | Maps `applyhub-postgres` container. |
| `backend` | 3001 | 3001 (`BACKEND_PORT`) | NestJS HTTP. |
| `frontend` (dev) | 5173 | 5173 (`FRONTEND_PORT`) | Vite dev server. |
| `frontend` (prod) | 80 | choose at deploy time | nginx serving `dist/`. |

CORS allows only `CORS_ORIGIN`. Behind a reverse proxy you should
either set `CORS_ORIGIN` to the public origin, or terminate TLS in front
of nginx and serve the SPA + API from the same origin (then CORS is
unnecessary).

---

## 6. NPM scripts (cheat sheet)

### Backend (`backend/`)

| Script | Purpose |
| ------ | ------- |
| `start`, `start:dev`, `start:debug`, `start:prod` | Nest CLI flavors. |
| `build` | `nest build` → `dist/`. |
| `lint`, `format` | ESLint `--fix`; Prettier. |
| `test`, `test:watch`, `test:cov` | Jest with `--experimental-vm-modules`. |
| `prisma:generate` | Regenerate Prisma client. Runs as `postinstall`. |
| `prisma:db:push` | `ensure-text-selector-columns.mjs` then `prisma db push`. |
| `prisma:migrate:dev` / `prisma:migrate:deploy` | Versioned migrations. |
| `prisma:studio` | Studio with host-friendly URL via `prisma-studio-local.mjs`. |
| `seed` | Idempotent template seed. |
| `prisma:db:push:replica`, `prisma:studio:replica`, `seed:replica` | Same, but against the replica. |
| `db:status` | JSON report of row counts + `MAX(updatedAt)` per model on both DBs. |
| `db:sync:incremental:local-to-replica` / `replica-to-local` | Paginated upsert (200/batch) only when source is newer. Add `-- --prune` to delete orphan rows on the target. |
| `db:sync:local-to-replica` / `replica-to-local` | Full snapshot via Docker `pg_dump | psql`. |

### Frontend (`frontend/`)

| Script | Purpose |
| ------ | ------- |
| `dev` | `vite --host 0.0.0.0` (binds `0.0.0.0` so containers can expose it). |
| `build` | `tsc -b && vite build`. |
| `preview` | Serve the built `dist/` locally. |
| `lint` | ESLint. |

---

## 7. Build-time vs. runtime configuration

- The frontend image bakes `VITE_API_URL` at build time. To change the API
  origin at runtime you must rebuild the image **or** put the SPA behind
  a reverse proxy that rewrites the API host.
- The backend reads everything at startup. Changing env values requires a
  process restart (Docker `restart` is enough).
- `DATABASE_LOGGING` is hot when restarted but never per-request; toggle
  it temporarily during incident response for verbose Prisma logs.

---

## 8. Diagnostics checklist

When something looks wrong, in order:

1. **`npm run db:status`** → confirms primary/replica are in lock-step (or
   shows the model that diverged).
2. **`docker compose logs backend --tail=200`** → shows replication
   warnings (`[replication] retry`, `falling back`, etc.).
3. **`docker compose exec postgres psql ... -c '\dt'`** → quick sanity
   check that tables exist.
4. **`curl http://localhost:3001/api/dashboard | jq`** → verifies the
   backend is reachable and the schema is consistent.

If `DATABASE_URL_REPLICA` is set but the secondary is unreachable at
startup, the backend logs a warning and runs without replication. Restart
once the replica is healthy.
