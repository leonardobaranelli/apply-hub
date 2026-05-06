# Development guide

> Day-to-day setup, code conventions, and contribution workflow. Pair this
> with [`architecture.md`](./architecture.md) and the per-area deep dives
> ([`backend.md`](./backend.md) / [`frontend.md`](./frontend.md) /
> [`database.md`](./database.md)).

---

## 1. Prerequisites

- **Docker Desktop** (the default workflow). Compose v2 is fine.
- Or, for "no Docker" development:
  - **Node.js** ≥ 20 (LTS).
  - **PostgreSQL** 16 reachable over TCP.
  - **OpenSSL** available on `PATH` (Prisma's query engine needs it on
    Alpine; macOS/Windows ship one already).

---

## 2. First-time setup

### Dockerized (recommended)

```bash
git clone <repo>
cd apply-hub
cp .env.example .env
docker compose up -d
docker compose logs -f backend          # watch the boot
```

The first boot installs deps, runs `prisma generate`, applies the schema
(`ensure-text-selector-columns.mjs` then `prisma db push`), and starts
the watchers. Subsequent boots are seconds.

### Without Docker

```bash
git clone <repo>
cd apply-hub
cp .env.example .env

# Postgres 16 must already exist locally; create the DB and user manually.
# Then point DATABASE_URL at it (e.g. postgresql://user:pass@localhost:5432/applyhub).

cd backend
npm install
npm run prisma:db:push
npm run start:dev                       # http://localhost:3001/api

# In another shell
cd frontend
npm install
npm run dev                             # http://localhost:5173
```

Tip: run `npm run seed` in the backend to populate `Templates` with
sensible defaults.

---

## 3. Repository conventions

### Branches

- `main` is the latest released code.
- `dev` is the integration branch.
- Feature branches: `feat/<topic>` or `fix/<topic>` or `docs/<topic>` or
  `chore/<topic>`. Branch names are kebab-case.
- All branches start from `dev` unless stated otherwise.
- PRs target `dev`. Merges into `main` are squash merges per release.

### Commits

The repo uses **Conventional Commits**, single-line, present-tense:

```
<type>(<scope>): <imperative summary>
```

Examples taken from `git log`:

- `feat(applications): add required job title field and default resume to english version`
- `fix(applications): translate job required language labels`
- `feat(backend): adjust incremental sync and status, add testable middleware and jest coverage`
- `fix(settings): persist all settings changes with autosave and prevent footer status flicker`

Allowed `type` values:

| Type | When to use |
| ---- | ----------- |
| `feat` | A new user-visible feature or capability. |
| `fix` | A bug fix. |
| `chore` | Tooling, deps, refactor that does not affect behavior. |
| `docs` | Documentation-only change. |
| `refactor` | Internal restructuring with no behavior change. |
| `perf` | Performance change. |
| `test` | Adding/updating tests only. |

`scope` is one of: `applications`, `application-events`, `contacts`,
`search-sessions`, `templates`, `dashboard`, `platform-settings`,
`replication`, `frontend`, `backend`, `db`, `docs`, `infra`, `settings`,
`tests`. Coin a new one only if needed.

### PR workflow

1. Branch off `dev`.
2. Push, open PR against `dev`.
3. PR description states **what** and **why**. The "how" lives in the
   diff — keep the description focused.
4. Each PR should be self-contained and pass CI (when present): backend
   `npm test`, both `npm run lint`, frontend `npm run build`.
5. Squash-merge from the PR UI.

---

## 4. Code style

### TypeScript

- **Strict mode** is on (both projects). No implicit `any`.
- Prefer **`as const` records** over `enum` (the frontend uses this
  pattern in `types/enums.ts`; the backend uses Prisma-generated unions).
- Avoid TypeScript namespaces.
- Avoid default exports for shared modules; named exports are easier to
  rename.
- Public service / API types are exported from a single `types/` or DTO
  file per resource — keep them stable.

### Backend (NestJS)

- One module folder per domain aggregate
  (`modules/<aggregate>/<aggregate>.{module,controller,service}.ts` plus
  `dto/`, `domain/`).
- Controllers stay thin: parse → call service → return. **No** business
  logic in controllers.
- Services own all business logic and Prisma calls. **Never** instantiate
  a `PrismaClient` outside `PrismaService` — replication relies on it.
- Cross-module collaboration via DI, not via reaching into another
  module's directory tree.
- Use `class-validator` decorators on every DTO. Boolean and number
  fields require `@Type(() => Boolean)` / `@Type(() => Number)` because
  query strings arrive as strings.
- Errors: throw Nest's standard exceptions (`NotFoundException`,
  `BadRequestException`, …). The global `HttpExceptionFilter` formats
  them.

### Frontend (React + Vite)

- One TanStack Query hook file per resource. Centralize cache keys in a
  `<resource>Keys` namespace.
- Components are functional + hooks; **no class components**.
- Reach the API only through `lib/api.ts` (the shared axios instance).
- Styling: Tailwind utilities. Prefer composing classes via `cn(...)`
  from `lib/cn.ts` (which wraps `clsx` + `tailwind-merge`).
- Charts must use `lib/chart-palette.ts` helpers — never hex codes — so
  the palette re-skins per theme.
- Forms: `react-hook-form` + Zod (`@hookform/resolvers/zod`).
- Toasts: Sonner. Never `alert()` / `confirm()`.

### Linting / formatting

- Backend: `npm run lint` (ESLint + Prettier via
  `eslint-plugin-prettier`).
- Frontend: `npm run lint` (ESLint).
- Run both before opening a PR. The `npm run format` script in the
  backend writes Prettier defaults to disk; the frontend relies on
  editor integration.

---

## 5. Testing the SPA manually

Until the frontend grows automated tests, this is the smoke checklist
for any non-trivial change:

1. **Log in flows are not applicable** (no auth) — but ensure the SPA
   loads `/api/dashboard` successfully.
2. **Settings**:
   - Switch theme and appearance — body class on `<html>` should update
     immediately and persist via `localStorage`.
   - Add a custom slug → confirm it appears in the application form, in
     the filters bar, and in the dashboard distributions.
   - Hide a built-in option → confirm it disappears from selectors but
     historical applications keep their stored value.
3. **Applications**:
   - Create an application — confirm a new row appears in the list and a
     new event in `/applications/:id` (timeline).
   - Move it through the funnel: `applied → screening → interview → offer → accepted`.
     Confirm `firstResponseAt` is set on the first non-applied
     transition, and `closedAt` is set on accepted.
   - Archive → restore.
4. **Search sessions**:
   - Create with `platform=other` and a `platformOther` value. Switch
     `platform` to something else and confirm `platformOther` was
     cleared.
5. **Templates**:
   - Create, mark favorite, copy → confirm `usageCount` increments.
6. **Dashboard**:
   - Both tabs render. Date pickers narrow the result set as expected.

---

## 6. Adding a new domain entity

1. Add the model + relations in `backend/prisma/schema.prisma`.
2. Run `npm run prisma:db:push` (or `prisma:migrate:dev`).
3. Update `backend/test/helpers/prisma-mock.ts` `ALL_MODELS` to include
   the new delegate name.
4. Update `backend/src/prisma/replication.middleware.ts`
   `REPLICATED_MODELS` (if writes should be mirrored).
5. Update `backend/scripts/db-status.mjs` `MODELS` and `REPORT_KEYS`,
   plus `backend/scripts/db-sync-incremental.mjs` `MODELS` to keep the
   ops scripts in sync.
6. Add a Nest module (controller + service + DTOs + `domain/`).
7. Wire it into `app.module.ts`.
8. Write a `test/modules/<entity>.service.spec.ts`.
9. Update `docs/api.md` (endpoints), `docs/database.md` (schema entry),
   `docs/postman-collection.json` (endpoints), and any cross-references.
10. Add a frontend `api/<entity>.ts`, `hooks/use-<entity>.ts`, and the UI
    needed.

The codebase is small enough that a checklist like this is the most
efficient discipline.

---

## 7. Adding a new selector vocabulary

Selector vocabularies (e.g. `application_method`, `position`) are the
"configurable enums" pattern. To add a new one:

1. Add the canonical id list as `as const` in
   `frontend/src/types/enums.ts` and the default labels in
   `frontend/src/types/labels.ts`.
2. Mirror the canonical list in
   `backend/src/modules/<domain>/domain/<entity>.enums.ts`.
3. Add the corresponding fields to `formConfig` (custom slugs / order /
   hidden / labels) — see
   [`database.md`](./database.md#3-configurable-vocabularies-formconfig).
   Update `assertValidFormConfig` (the `assertCustomSlugs`,
   `assertFullPermutation`, `assertSubset`, `assertLabelKeys` calls).
4. Re-validate selectors on every relevant write
   (e.g. `assertApplicationSelectors` in the applications service).
5. Update `PlatformSettingsContext` to expose the new
   `effective<X>Labels` and `<X>SelectOptions` arrays.
6. Add the controls to `pages/settings.tsx` (`renderConfigurableList`).
7. Use `effective<X>Labels[id] ?? id` everywhere that displays the value.

---

## 8. Local Prisma Studio

Studio that "just works" on the host:

```bash
cd backend
npm run prisma:studio
```

It uses `scripts/prisma-studio-local.mjs` to rewrite the compose-internal
hostname `postgres` to `127.0.0.1` + `POSTGRES_PORT` (default 5432) when
running outside Docker — so you don't need to edit `.env`.

For the replica:

```bash
npm run prisma:studio:replica
```

This shells through `run-on-replica.mjs`, which swaps `DATABASE_URL` to
`DATABASE_URL_REPLICA` only for that command's environment.

---

## 9. Common pitfalls

- **Forgot to apply schema to the replica.** Symptom: writes succeed on
  the primary but the mirror op throws and gets dropped after retries.
  Fix: `npm run prisma:db:push:replica` (or migrate deploy).
- **Used `process.env` directly in a service.** Replace with
  `ConfigService<AppConfig, true>`.
- **Used a hex color in a chart.** Replace with `chartColor(slot)` so
  themes re-skin properly.
- **Forgot `Type` decorator on a query DTO field.** Symptom: filters
  silently treated as strings (`true` becomes `'true'`). Fix: add
  `@Type(() => Boolean)` etc.
- **Boolean URL params**. The list endpoints accept booleans as the
  literal strings `true` / `false` because `class-transformer` parses
  them. Sending `1`/`0` will not work.

---

## 10. Where to ask questions

This is a single-operator project; the canonical answer is **read the
relevant `docs/` page first**. The order of authority when in doubt:

1. The **schema** (`backend/prisma/schema.prisma`).
2. The **DTOs** (`backend/src/modules/**/dto/`).
3. The **services** (`backend/src/modules/**/*.service.ts`).
4. The **tests** (`backend/test/`).
5. The **docs** (`docs/`).

If a `docs/` page contradicts the code, the code wins — please open an
issue or PR to fix the doc.
