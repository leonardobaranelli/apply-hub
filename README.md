# ApplyHub
Full-stack hub to centralize the job search in one place: search sessions, applications, statuses, templates and analytics.

Use it by running `docker compose up` from the repository root; this brings up the full local stack. Then register and update your search sessions and applications as your process evolves (optional secondary replica database for data resilience; more details in the `docs/` directory).

The `docs/` folder contains the complete technical documentation in detail:

## Index

| Document | Purpose |
| -------- | ------- |
| [`architecture.md`](./architecture.md) | High-level architecture, runtime topology, request lifecycle, cross-cutting concerns. |
| [`backend.md`](./backend.md) | NestJS module-by-module deep dive: controllers, services, DTOs, domain helpers. |
| [`frontend.md`](./frontend.md) | React + Vite SPA deep dive: routing, state, theming, vocabulary, components. |
| [`database.md`](./database.md) | Prisma schema, indexes, cascades, configurable vocabularies, write-mirror replica. |
| [`api.md`](./api.md) | Full HTTP API reference (every endpoint, every parameter, every response shape). |
| [`postman-collection.json`](./postman-collection.json) | Importable Postman collection covering 100% of the API surface. |
| [`configuration.md`](./configuration.md) | Environment variables, defaults, validation rules, npm scripts. |
| [`operations.md`](./operations.md) | Docker workflow, replica enablement, sync runbook, production deployment. |
| [`testing.md`](./testing.md) | Test pyramid, suites, fixtures, contracts the tests lock in place. |
| [`development.md`](./development.md) | Local dev setup without Docker, code conventions, contribution workflow. |
| [`security.md`](./security.md) | Single-operator threat model, perimeter assumptions, hardening guidance. |

---

## How to read these docs

If you are…

- **New to the project** → read [`architecture.md`](./architecture.md) first to
  understand the runtime, then [`backend.md`](./backend.md) and
  [`frontend.md`](./frontend.md) for the implementation details that matter
  most for day-to-day work.
- **Integrating a client** → jump straight to [`api.md`](./api.md) and import
  [`postman-collection.json`](./postman-collection.json) into Postman/Insomnia.
- **Operating the system** (deploys, backups, replica) → read
  [`operations.md`](./operations.md) and [`configuration.md`](./configuration.md).
- **Modifying the schema** → start with [`database.md`](./database.md), then
  read the replica section of [`operations.md`](./operations.md) — schema
  migrations must be applied to **both** primary and replica.
- **Hardening before exposing it** → read [`security.md`](./security.md). The
  app ships with **no authentication** and assumes a controlled network
  perimeter.

---

## Conventions used in this folder

- All documents are **English-only**.
- File names are kebab-case, lowercase.
- Inline code uses backticks; block code fences declare a language for syntax
  highlighting.
- Cross-references are relative links to the file (`./api.md#section`) so they
  work both on GitHub and in any local Markdown viewer.
- Tables are preferred over prose whenever a contract is being described
  (endpoints, env vars, enums, DTO fields).
- Whenever a behavior is asserted by a test, the doc points to the file that
  locks it in (so the contract is verifiable, not just narrated).
