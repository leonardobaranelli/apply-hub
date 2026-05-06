# ApplyHub

[![Docker Compose](https://img.shields.io/badge/Docker_Compose-2496ED?style=flat&logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)

Full-stack hub to centralize the job search in one place: search sessions, applications, statuses, templates and analytics.

## Run locally

Use it by running `docker compose up` from the repository root; this brings up the full local stack. Then register and update your search sessions and applications as your process evolves (optional secondary replica database for data resilience; more details in the `docs/` directory).

## Documentation

Complete technical documentation lives in [`docs/`](./docs/):

- [`architecture.md`](./docs/architecture.md) (high-level architecture, runtime topology, and request lifecycle)
- [`backend.md`](./docs/backend.md) (NestJS modules, controllers, services, DTOs, and domain helpers)
- [`frontend.md`](./docs/frontend.md) (React + Vite SPA: routing, state, theming, and components)
- [`database.md`](./docs/database.md) (Prisma schema, indexes, cascades, and write-mirror replica)
- [`api.md`](./docs/api.md) (complete HTTP reference: endpoints, parameters, and response shapes)
- [`configuration.md`](./docs/configuration.md) (environment variables, defaults, validation rules, and scripts)
- [`operations.md`](./docs/operations.md) (Docker workflow, replica enablement, sync runbook, and deployment)
- [`testing.md`](./docs/testing.md) (test strategy, suites, fixtures, and locked contracts)
- [`development.md`](./docs/development.md) (local setup without Docker, conventions, and contribution workflow)
- [`security.md`](./docs/security.md) (single-operator threat model and hardening guidance)
- [`postman-collection.json`](./docs/postman-collection.json) (importable Postman collection for the full API)

