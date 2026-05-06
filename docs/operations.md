# Operations runbook

> Practical commands and procedures for running ApplyHub. The
> architectural background lives in [`architecture.md`](./architecture.md);
> the full env matrix in [`configuration.md`](./configuration.md).

---

## 1. Local Docker workflow

The default development experience is fully Dockerized via
[`docker-compose.yml`](../docker-compose.yml).

```bash
cp .env.example .env       # one-time
docker compose up -d       # postgres + backend + frontend
docker compose logs -f backend frontend
docker compose down        # stop (preserves the volume)
docker compose down -v     # stop and wipe data (careful!)
```

What happens on `up`:

| Service | Image / build target | Behavior |
| ------- | -------------------- | -------- |
| `postgres` | `postgres:16-alpine` | Healthchecked with `pg_isready`. Volume `postgres-data`. |
| `backend` | `backend/Dockerfile` target `development` | Installs deps, generates Prisma client, runs `ensure-text-selector-columns.mjs`, then `prisma db push`, then `nest start --watch`. |
| `frontend` | `frontend/Dockerfile` target `development` | Installs deps, runs `vite --host 0.0.0.0`. |

URLs after `up`:

- API: <http://localhost:3001/api>
- Swagger: <http://localhost:3001/api/docs> (only when `NODE_ENV !== 'production'`)
- SPA: <http://localhost:5173>
- Postgres: `localhost:5432` (user/password from `.env`)

Useful one-liners:

```bash
docker compose exec backend npm test
docker compose exec backend npm run prisma:studio
docker compose exec postgres psql -U applyhub -d applyhub -c '\dt'
```

---

## 2. Production deployment

### Backend image

`backend/Dockerfile` exposes a `production` target:

- `node:20-alpine`, `apk add openssl` (Prisma needs it).
- `npm ci --omit=dev`, `npx prisma generate`.
- `COPY --from=build /app/dist ./dist`.
- `CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]`.

`migrate deploy` is **non-interactive** and idempotent — safe for
container start. Set `NODE_ENV=production` to disable Swagger.

### Frontend image

`frontend/Dockerfile` exposes a `production` target:

- 2-stage build: `node:20-alpine` for `npm ci + npm run build`, then
  `nginx:alpine` serves `dist/` with `nginx.conf`.
- `nginx.conf` does `try_files $uri /index.html;` for SPA fallback.
- `VITE_API_URL` is **build-time**; bake it in or front the SPA with a
  proxy.

### Suggested topology

- Single VM:
  - reverse proxy (Caddy/nginx) terminates TLS.
  - serves SPA on `/` and proxies `/api/*` to the backend container.
  - backend runs as a docker container.
  - PostgreSQL is either:
    - a managed service (recommended), or
    - another container with a host-mounted volume + nightly `pg_dump`.

- Recommended health checks:
  - backend: `GET /api/dashboard` (cheap, hits Prisma + most modules).
  - frontend: `GET /` returns `index.html` quickly via nginx.

---

## 3. Replica runbook

The replica is **opt-in** via `DATABASE_URL_REPLICA`. Read the
architecture in
[`database.md`](./database.md#4-write-mirror-replica) and
[`backend.md`](./backend.md#3-prismaservice-and-the-write-mirror) before
operating it.

### Provisioning

1. Create a fresh PostgreSQL 16 database on your secondary provider.
2. Add `DATABASE_URL_REPLICA=postgresql://...?sslmode=require` to `.env`
   on the host running ApplyHub.
3. Apply schema:

   ```bash
   cd backend
   npm run prisma:db:push:replica       # development / db push
   # or, in production:
   npx node scripts/run-on-replica.mjs npx prisma migrate deploy
   ```

4. Optional: `npm run seed:replica` to seed templates on the replica.
5. Restart the backend:

   ```bash
   docker compose restart backend
   ```

   Backend logs should show
   `[replication] Mirror connection ready` (no error).

### Day 2: parity check

```bash
cd backend
npm run db:status
```

The output is a JSON report:

```json
{
  "sameCounts": true,
  "local":   { "counts": { ... }, "maxUpdatedAt": { ... } },
  "replica": { "counts": { ... }, "maxUpdatedAt": { ... } }
}
```

`sameCounts: false` means the two sides drifted (typically because the
replica was unreachable for a while). Use the incremental sync to
re-converge:

```bash
npm run db:sync:incremental:local-to-replica
# add `-- --prune` to also delete rows that no longer exist on the source
npm run db:sync:incremental:local-to-replica -- --prune
```

The incremental sync iterates parents → children, pages 200 rows at a
time, and only writes when the source row is newer than the target.

### Disaster recovery — full snapshot

For a complete catastrophic restore, use the snapshot scripts (they shell
out to a one-off `postgres:18-alpine` container running
`pg_dump | psql`):

```bash
# replica is corrupted, rebuild it from local
npm run db:sync:local-to-replica

# local is corrupted, restore it from the replica
npm run db:sync:replica-to-local
```

These commands assume:

- Docker daemon is reachable.
- The compose network exists (`apply-hub_default` by default; override
  with `DOCKER_NETWORK=...`).
- Both URLs are valid; query strings like `sslmode=require` are honored.

The snapshot drops & recreates objects on the destination
(`--clean --if-exists`).

### Reads from the replica

The replica is **never** read by the running backend. To read from it
without rotating env vars on the live process, use:

```bash
node backend/scripts/run-on-replica.mjs npx prisma studio
```

That spawns a one-off Prisma Studio with `DATABASE_URL` swapped to
`DATABASE_URL_REPLICA` from `.env`.

### Failure semantics summary

| Situation | Effect |
| --------- | ------ |
| Replica unreachable at boot | Warning logged. Replication middleware **not installed**. Backend works normally on the primary. Restart once the replica is healthy. |
| Replica goes down at runtime | Each mirrored op retries with backoff (200 ms → 1 s → 5 s). On exhaustion, op is dropped from the queue with a warning. Primary writes already succeeded. |
| Replica returns success | Nothing visible to the user. Mirror queue length drops by 1. |
| Schema drift between primary and replica | Likely runtime error in the mirror op. Re-apply migrations on the replica (`prisma:db:push:replica` / `prisma:migrate:deploy` via `run-on-replica.mjs`). |

---

## 4. Backups

Even with the replica, take a real backup:

```bash
docker compose exec postgres pg_dump -U applyhub -d applyhub > backup.sql
```

Restore:

```bash
docker compose exec -T postgres psql -U applyhub -d applyhub < backup.sql
```

For automated rotation, schedule the same `pg_dump` via cron / GitHub
Actions / managed-DB snapshot policies.

---

## 5. Schema changes

1. Edit `backend/prisma/schema.prisma`.
2. In development:

   ```bash
   cd backend
   npm run prisma:db:push                # primary
   npm run prisma:db:push:replica        # replica (if used)
   ```

3. For production / version control, prefer migrations:

   ```bash
   npm run prisma:migrate:dev -- --name <change>
   git commit -m "feat(db): <change>"
   # deploy => CMD already runs `prisma migrate deploy`
   # replica => npx node scripts/run-on-replica.mjs npx prisma migrate deploy
   ```

4. If a column changes type non-trivially (e.g. enum → varchar),
   `ensure-text-selector-columns.mjs` is the template for an idempotent,
   data-preserving SQL migration. Add to it as needed.

---

## 6. Observability

The codebase has minimal observability surface today. Recommended
upgrades when you outgrow `docker compose logs`:

- Pipe Prisma logs to your stack via `DATABASE_LOGGING=true` and a JSON
  log shipper.
- Wrap `HttpExceptionFilter` to forward 5xx to Sentry/Logtail.
- Add a `/health` endpoint that pings Prisma + (if configured) the replica.
- Track replication queue depth (`PrismaService.replication.length` if
  exposed) — useful to detect a flatlined replica before `db:status`
  catches it.

These are intentionally not built in: the project targets a single
operator with `docker compose logs` and `npm run db:status`.

---

## 7. Common operational commands

| Goal | Command |
| ---- | ------- |
| Restart backend (e.g. after env change) | `docker compose restart backend` |
| Tail backend logs | `docker compose logs -f backend` |
| Open Prisma Studio against primary | `cd backend && npm run prisma:studio` |
| Open Prisma Studio against replica | `cd backend && npm run prisma:studio:replica` |
| Seed templates on primary | `cd backend && npm run seed` |
| Seed templates on replica | `cd backend && npm run seed:replica` |
| Compare primary and replica row counts | `cd backend && npm run db:status` |
| Re-converge replica incrementally | `cd backend && npm run db:sync:incremental:local-to-replica` |
| Force full snapshot local → replica | `cd backend && npm run db:sync:local-to-replica` |
| Force full snapshot replica → local | `cd backend && npm run db:sync:replica-to-local` |
| Run a custom command against the replica | `cd backend && node scripts/run-on-replica.mjs <cmd>` |

---

## 8. Upgrade checklist

- Bump versions in `backend/package.json` and `frontend/package.json`.
- Run `npm install` in both.
- Run `npm test` in `backend/`.
- Apply Prisma changes (`migrate dev`, then `migrate deploy` in prod).
- Smoke test:
  - `curl http://localhost:3001/api/dashboard`
  - Open the SPA dashboard and check the Pipeline + Search activity tabs.
- If a replica is configured, confirm `npm run db:status` reports
  `sameCounts: true` after a few minutes.
