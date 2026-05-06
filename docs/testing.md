# Testing

> All tests live under `backend/test/`. Jest is the only runner.
> The frontend ships no automated tests yet — see
> [`development.md`](./development.md#5-testing-the-spa-manually) for how
> to validate the SPA manually.

---

## 1. How to run

```bash
cd backend
npm install
npm test                  # all suites, single run
npm run test:watch        # watch mode
npm run test:cov          # with coverage (text + lcov)
```

The `test` script is intentionally:

```json
"test": "node --experimental-vm-modules node_modules/jest/bin/jest.js"
```

The `--experimental-vm-modules` flag is mandatory: the script suites
dynamically `import()` `.mjs` files via `helpers/esm-import.ts`, which is
the only way to load real ES modules from a CJS Jest runner without
re-routing through Jest's resolver.

---

## 2. Suite layout

```
backend/test/
├── helpers/
│   ├── esm-import.ts                          # native dynamic import escape hatch
│   └── prisma-mock.ts                         # createPrismaMock + canonical model lists
├── modules/
│   ├── application-events.service.spec.ts
│   ├── applications.service.spec.ts
│   ├── contacts.service.spec.ts
│   ├── platform-settings.service.spec.ts
│   ├── search-sessions.service.spec.ts
│   └── templates.service.spec.ts
├── prisma/
│   └── replication.middleware.spec.ts
└── scripts/
    ├── db-status.spec.ts
    └── db-sync-incremental.spec.ts
```

Three categories:

- **Module unit tests** (`test/modules/`) — assert business behavior of
  each service against a deeply-mocked `PrismaService`.
- **Replication middleware tests** (`test/prisma/`) — verify the contract
  of the write-mirror state machine in isolation.
- **Script tests** (`test/scripts/`) — load the `.mjs` ops scripts via the
  native ESM loader and exercise their pure helpers (`MODELS`,
  `parseEnvFile`, `sanitizePgUrl`, `localDatabaseUrlForHost`, `collect`,
  `buildReport`, `diffSnapshots`, etc.).

---

## 3. Helpers

### `helpers/prisma-mock.ts`

Source of truth for the model list (`ALL_MODELS`) and the action lists
(`ALL_MUTATING_ACTIONS`, `ALL_READ_ACTIONS`). Used by both the module
suites and the replication suite, so adding a new model anywhere requires
updating this single helper, which then trickles down to every spec.

`createPrismaMock()` returns a `PrismaMock` shaped like the real client:

- Every model exposes Jest mocks for every Prisma action, returning
  `undefined` by default.
- `$queryRawUnsafe`, `$executeRawUnsafe`, `$connect`, `$disconnect`,
  `$use` are all jest mocks.
- `$transaction` supports both forms used in the codebase:
  - **Array form** (`prisma.$transaction([...])`) — `Promise.all`s the
    inputs.
  - **Callback form** (`prisma.$transaction(async (tx) => ...)`) — `tx`
    is the same mock so spies remain visible.

### `helpers/esm-import.ts`

```ts
const nativeImport = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<unknown>;
```

`ts-jest` (CJS mode) rewrites `await import(x)` into a `require`-based
call. The `new Function` indirection keeps the call literal so Node's
native ESM loader picks up the script. This is the only sane way to test
the project's `.mjs` scripts inside Jest.

---

## 4. Module suites

Each suite instantiates the real service with a fresh `createPrismaMock()`
and the real domain helpers (no `@Injectable()` magic, no Nest test
module). The contracts they lock in are catalogued per module in
[`backend.md`](./backend.md#4-modules). Highlights:

- **`applications.service.spec.ts`** — covers create transactions,
  trimming, default dates, selector validation, every status transition
  branch (`firstResponseAt`, `closedAt`, reopen, terminal), archive /
  restore, link contacts, hard delete, and `markStaleAsGhosted`.
- **`application-events.service.spec.ts`** — covers parent existence,
  `lastActivityAt` bump, `firstResponseAt` once-only behavior, response
  vs non-response event classification, `P2025 → 404`.
- **`contacts.service.spec.ts`** — covers trim semantics, pagination
  math, ILIKE filters, P2025.
- **`search-sessions.service.spec.ts`** — covers vocabulary validation,
  trimming, the `platformOther` lifecycle (only persisted when
  `platform === 'other'`, cleared on switch).
- **`templates.service.spec.ts`** — covers list filters, favorite toggle,
  usage counter increment, P2025.
- **`platform-settings.service.spec.ts`** — covers default-row creation,
  `assertValidFormConfig` rejecting invalid slugs / unknown label keys,
  partial updates.

The suites are deliberately **white-box**: they know which Prisma calls
the service makes, which order, and inside which transaction. That is a
feature: it's how the contract with the replication middleware is
enforced (every write goes through `prisma.<model>.{create|update|delete|...}`,
never raw SQL).

---

## 5. Replication middleware suite

`backend/test/prisma/replication.middleware.spec.ts` covers the full
state machine:

- **Static metadata**:
  - `REPLICATED_MODELS` matches the canonical model list.
  - `MUTATING_ACTIONS` covers every Prisma write action and excludes every
    read action.
- **`shouldReplicate`**:
  - True only for mutating actions on a known model.
  - False for read-only actions, raw queries, unknown models, or `null`.
- **Forwarding**:
  - Calls the matching delegate on the replica with the same args.
  - Cloning of args (`cloneArgs`) so mutating the original after the call
    cannot tamper with the queued replication.
- **Retry / backoff**:
  - `isRetryableReplicaError` returns true for known transient errors
    (`P1001`, `P1002`, `P1017`, `ECONNRESET`, `ETIMEDOUT`, etc.).
  - On retryable errors the middleware waits `[200ms, 1000ms, 5000ms]`
    using the injected `sleep` (so tests run instantly).
  - On non-retryable errors it gives up immediately and logs.
- **Queue semantics**:
  - All writes are enqueued and never block the primary path.
  - `drain()` resolves once the queue is empty.
  - Logger receives one warning per dropped op.

The suite uses fake timers and a stub `sleep` so that retry timing is
deterministic.

---

## 6. Script suites

### `db-status.spec.ts`

- Asserts the canonical `MODELS` list mirrors `ALL_MODELS` (so adding a
  Prisma model without updating the script will fail tests).
- Asserts `REPORT_KEYS` covers every model.
- `collect()` is exercised with a synthetic Prisma stub: it must call
  `count` and `aggregate({ _max: { updatedAt: true } })` per model AND
  query the `_ApplicationContacts` pivot via `$queryRawUnsafe`.
- `diffSnapshots()` returns `true` only when both `counts` records are
  byte-identical.
- `buildReport()` aggregates the two collects.

### `db-sync-incremental.spec.ts`

- Validates the FK-safe `MODELS` order:
  - `contact` and `jobSearchSession` come before `jobApplication`.
  - `jobApplication` comes before `applicationEvent`.
- Tests `parseEnvFile` against quoted, unquoted, comment, and blank lines.
- Tests `sanitizePgUrl` strips `?schema=...` (Prisma's parameter that
  `pg_dump` does not understand).
- Tests `localDatabaseUrlForHost` rewrites compose's `postgres` hostname
  to `127.0.0.1` + the published port when **not** running inside Docker
  (and is a no-op when inside Docker).
- Tests `toMs(updatedAt)` (handles `null`, `Date`, ISO string, number).
- Tests the upsert decision (only when source is newer / target row is
  missing).
- Tests the `--prune` mode (drops target rows not present on source) is
  opt-in and never triggers without the flag.

---

## 7. Coverage policy

`jest.config.js` collects coverage from `src/**/*.ts` minus DTOs and
module declarations:

```js
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/**/*.module.ts',
  '!src/**/*.dto.ts',
  '!src/**/dto/**',
  '!src/**/index.ts',
  '!src/main.ts',
],
```

There is no minimum threshold enforced: the suites are designed to track
**business contracts**, not pursue an arbitrary coverage number. New
features are expected to come with new spec files (see existing modules
for shape).

`clearMocks: true` and `restoreMocks: true` are global — every test
starts from a clean slate, so order does not matter and there are no
hidden cross-test leaks.

---

## 8. Conventions

- **One spec per service / script**, named `<file>.spec.ts`.
- **Black-box where possible, white-box where the side effect matters.**
  For example, the `ApplicationsService` is white-box because the
  transaction shape is part of the replication contract.
- Prefer `describe` blocks that mirror the public method names.
- Use `expect(prisma.$transaction).toHaveBeenCalledTimes(1)` to lock in
  atomicity guarantees.
- For status transitions, assert **all** of: `status`, `stage`,
  `lastActivityAt`, `firstResponseAt`/`closedAt` (when applicable), and
  the emitted event type + metadata.
- New helpers belong in `test/helpers/` — keep specs free of utility
  functions to avoid duplication.

---

## 9. CI guidance

The repo does not ship a CI config, but a minimal pipeline would be:

```yaml
- run: npm ci --prefix backend
- run: npm run lint --prefix backend
- run: npm test --prefix backend
- run: npm ci --prefix frontend
- run: npm run lint --prefix frontend
- run: npm run build --prefix frontend
```

For schema changes you can additionally spin up a throwaway Postgres
service in CI and run `npx prisma migrate deploy` against it to fail
loudly on bad migrations.
