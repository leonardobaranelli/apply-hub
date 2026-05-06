# Security model

> ApplyHub is an opinionated **single-operator** application: the
> intended threat model is "one user, controlled network perimeter, no
> multi-tenancy". This document is honest about what is and is not
> defended in code.

If you intend to expose ApplyHub to the public internet or run it for
multiple users, treat this page as a checklist of work to do before
shipping.

---

## 1. Threat model

| Asset | Sensitivity | Notes |
| ----- | ----------- | ----- |
| Job application records | High (PII; employer relations). | Names, companies, salary ranges, contact details, free-text notes. |
| Contacts | High (PII). | Names, emails, phone numbers, LinkedIn URLs. |
| Templates / search sessions | Medium. | Free-text content, possibly with copied PII. |
| Platform settings | Low. | Theme + selector vocabulary. |
| Database credentials | High. | Live in `.env`. |
| Replica credentials | High. | Live in `.env`. |

The user is **the operator**. There is no "untrusted user" who can log
in. Every endpoint trusts the caller.

---

## 2. What the codebase does

### Input validation

- Every controller wraps every body / query in a DTO with
  `class-validator` decorators (`@IsString`, `@IsUUID`, `@IsIn`,
  `@IsOptional`, `@IsInt`, …).
- A global `ValidationPipe` is configured with:
  - `whitelist: true` — strips unknown properties.
  - `forbidNonWhitelisted: true` — **rejects** unknown properties with
    `400 Bad Request`.
  - `transform: true` + `enableImplicitConversion: true` — coerces query
    strings to the DTO types.
- Selector values (vocabulary ids) are double-validated at the service
  layer (`assertApplicationSelectors`,
  `assertValidFormConfig`) against the live `formConfig` plus the
  built-in id sets.

### Persistence

- All queries go through Prisma, parameterized — **no string-built SQL**
  except the activity-heatmap raw query (which uses `$1`/`$2`
  placeholders) and the `_ApplicationContacts` pivot count
  (`SELECT COUNT(*) FROM "_ApplicationContacts"`).
- The schema declares `onDelete` / `onUpdate` rules explicitly, removing
  surprise behavior on row deletion.
- Replication (when enabled) is asynchronous and never blocks the
  primary path; dropped replication ops never affect data integrity.

### Errors

- A global `HttpExceptionFilter` produces a uniform JSON error envelope
  (`{ statusCode, error, message, path, timestamp }`).
- Stack traces are logged for `>= 500` only and are **never** echoed in
  the response.
- The frontend's axios interceptor surfaces the `message` to the user
  via Sonner toasts; it does not surface stack frames.

### Configuration

- `Joi` validates env at boot. Missing required vars (`DATABASE_URL`)
  abort startup.
- `DATABASE_URL_REPLICA` may include `sslmode=require` for managed DBs;
  Prisma honors it. Local development uses unencrypted connections — see
  §3 for guidance when this is unacceptable.

### CORS

- Configured via `CORS_ORIGIN` (default `http://localhost:5173`). Comma
  separated for multiple origins.
- `credentials: true` is set; the SPA does not send cookies today, so
  this only matters if you later add an auth layer.

### Frontend

- The SPA is served as static assets by nginx in production. Standard
  cache-busting via Vite's hashed filenames.
- No third-party iframe-able content. No `eval`. No
  `dangerouslySetInnerHTML`.
- `localStorage` only stores the active theme + appearance. No tokens or
  PII.
- All outgoing API calls go through one axios instance — easy to add
  global headers (e.g. an auth token) in one place.

---

## 3. What the codebase does NOT do (by design)

- **No authentication.** `/api/*` is unprotected. Anyone who can reach
  the API can read or modify everything.
- **No rate limiting.** A single misbehaving client can hit the API in a
  loop.
- **No CSRF protection** (also no auth, so no surface).
- **No request size cap** beyond Express defaults.
- **No structured audit logging** beyond Nest's default request logger
  and Prisma's optional query log.
- **No secret rotation tooling.**
- **No PII redaction** in logs. If you turn on `DATABASE_LOGGING=true`
  in production, queries with values will be printed.
- **No SSL/TLS termination in the app.** Run a reverse proxy (Caddy,
  nginx, Traefik) in front for HTTPS.
- **No backups beyond manual `pg_dump` / the optional replica.**

These omissions are intentional for a single-operator hobby tool. Treat
each "no" as work to do before exposing the system.

---

## 4. Hardening checklist

If you decide to expose ApplyHub, do this in order:

1. **Network perimeter**
   - Put the SPA + API behind a reverse proxy that:
     - Terminates TLS.
     - Enforces HSTS.
     - Rewrites the SPA path so the API and SPA share an origin (then
       you can drop CORS).
   - Bind PostgreSQL only to the proxy's network. Never publish 5432 to
     the public internet.

2. **Authentication**
   - Add a single-user password (or OIDC) and a `/api/login` endpoint.
   - Issue an HTTP-only cookie or short-lived JWT.
   - Apply a global Nest `AuthGuard` and exempt only the login endpoint.
   - Mirror the cookie/JWT into the frontend axios instance.

3. **Rate limiting**
   - Add `@nestjs/throttler` with conservative defaults (e.g. 60 req/min
     per IP).
   - Apply per-route limits to the create/update endpoints to limit
     scraping.

4. **Audit logging**
   - Wrap `HttpExceptionFilter` to forward `>= 500` errors to a remote
     sink (Sentry, Logtail).
   - Log auth attempts with timestamps and IPs.

5. **Backups**
   - Schedule encrypted `pg_dump` to off-host storage.
   - Keep the replica enabled as a hot backup.

6. **Secrets**
   - Move `.env` out of disk; use the platform's secret store (Doppler,
     Vault, the platform's "secrets" UI).
   - Rotate `DATABASE_URL` / `DATABASE_URL_REPLICA` quarterly.

7. **Database hardening**
   - Use `sslmode=require` (or `verify-full`) on both URLs.
   - Run Postgres with `password_encryption=scram-sha-256`.

8. **Container hardening**
   - Drop the `applyhub-postgres` container's published port if running
     behind a private network.
   - Run images as non-root (the current images run as root for the
     development experience). For production, switch to `--user node`
     and adjust file permissions.

9. **Optional**: build a minimal `/health` endpoint for the proxy to
   probe; the dashboard endpoint is cheap but not designed as a
   liveness/readiness probe.

---

## 5. Sensitive-data inventory

If a breach happens, this is what is at risk:

- `Contact` rows: `name`, `email`, `phone`, `linkedin`, `notes`.
- `JobApplication` rows: `companyName`, `roleTitle`, `jobTitle`,
  `salaryMin`, `salaryMax`, `currency`, `notes`, `contact*` denormalized
  fields, `tags`.
- `ApplicationEvent.metadata`: free-form JSON, may include emails or
  message excerpts.
- `JobSearchSession.notes`, `Template.body`: free-form text.

There are no payment data, no auth secrets, no third-party API tokens
stored in the schema today. Adding any of these should be paired with at
least items 1, 2, and 6 of the hardening checklist.

---

## 6. Reporting

If you find a vulnerability:

- **Do not** open a public GitHub issue.
- Open a private "security advisory" via GitHub on the repository.
- Include reproduction steps, impact, and any logs you can share.

The maintainer is the sole reviewer; expect a response measured in days,
not hours.
