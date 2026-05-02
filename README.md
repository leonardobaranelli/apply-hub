# ApplyHub

Hub personal full‑stack para tratar **cada postulación como una entidad de primera clase**: estado, etapa, prioridad, salario, contactos, sesión de búsqueda que la originó, timeline auditable y analítica derivada — todo en un único lugar consultable.

> Single‑operator por diseño. **No hay autenticación**: corre detrás de un perímetro de red que vos controlás (red local, túnel, VPN, reverse proxy con auth).

---

## 1. Stack

| Capa | Tecnología |
| ---- | ---------- |
| API | NestJS 10 · Prisma 5 · PostgreSQL 16 · class‑validator/transformer · Joi · Swagger (`/api/docs` fuera de producción) |
| Web | React 18 + Vite 6 · TypeScript 5 · TanStack Query 5 · React Hook Form + Zod · Tailwind 3 · Recharts 2 · Sonner · Lucide |
| Infra | Docker Compose (`postgres` + `backend` + `frontend`) · Dockerfiles multi‑stage (`development` + `production`); en prod la SPA se sirve con `nginx:alpine` y la API con `node dist/main.js` |

---

## 2. Layout del repositorio

```
apply-hub/
├── backend/
│   ├── prisma/schema.prisma           # fuente de verdad del esquema
│   ├── scripts/                       # ops sobre primary y replica (mjs)
│   │   ├── db-status.mjs              # paridad entre primary y replica
│   │   ├── db-sync.mjs                # snapshot completo via pg_dump|psql en contenedor
│   │   ├── db-sync-incremental.mjs    # upsert paginado por id, solo si updatedAt > destino
│   │   ├── ensure-text-selector-columns.mjs  # migra enums PG legacy → VARCHAR (idempotente)
│   │   ├── run-on-replica.mjs         # ejecuta cualquier comando con DATABASE_URL=replica
│   │   └── prisma-studio-local.mjs    # abre Studio resolviendo `postgres` → `localhost:5432`
│   └── src/
│       ├── main.ts                    # bootstrap (prefix `/api`, CORS, ValidationPipe, filter global, Swagger)
│       ├── app.module.ts              # ConfigModule (Joi) + Prisma + 7 feature modules
│       ├── common/
│       │   ├── dto/pagination.dto.ts  # PaginationDto (page≥1, limit 1..200, default 25) + PaginatedResult<T>
│       │   └── filters/http-exception.filter.ts
│       ├── config/                    # configuration() tipada + validation.schema (Joi)
│       ├── prisma/                    # @Global PrismaService con write‑mirror middleware
│       ├── database/seed.ts           # 12 templates (6 EN + 6 ES) idempotente
│       └── modules/
│           ├── applications/          # controller · service · dto · domain (StatusResolverService, enums)
│           ├── application-events/    # append‑only timeline
│           ├── contacts/              # personas reutilizables (m:n con applications)
│           ├── search-sessions/       # log reproducible de cada búsqueda
│           ├── templates/             # cover letters, mensajes, follow‑ups
│           ├── dashboard/             # KPIs, funnel, heatmap, distributions, search activity
│           └── platform-settings/     # fila única (id="default") con vocabulario + tema
├── frontend/
│   ├── nginx.conf                     # SPA fallback `try_files $uri /index.html`
│   ├── vite.config.ts                 # alias `@` → src; host 0.0.0.0, polling
│   ├── tailwind.config.js             # tokens HSL via CSS vars (theming)
│   └── src/
│       ├── main.tsx, App.tsx          # router + QueryClient + PlatformSettingsProvider + Toaster
│       ├── api/                       # 1 axios client tipado por recurso
│       ├── components/                # ui primitives, applications, dashboard, layout, status
│       ├── context/                   # PlatformSettingsProvider (tema + vocabulario en una sola fuente)
│       ├── hooks/                     # 1 archivo de hooks Query/Mutation por recurso
│       ├── lib/                       # api · query‑client · theme · format · chart‑palette · cn · form‑*
│       ├── pages/                     # dashboard, applications/list, applications/detail, search‑sessions, templates, settings
│       └── types/                     # enums, labels, models, platform‑settings DTOs
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 3. Arquitectura

### 3.1 Forma canónica de un módulo backend

```
modules/<feature>/
├── <feature>.controller.ts   # superficie HTTP — solo binding y validación
├── <feature>.service.ts      # casos de uso, persistencia, transacciones
├── <feature>.module.ts       # wiring + imports cruzados
├── domain/                   # enums, helpers puros, resolvers (sin Nest deps cuando se puede)
└── dto/                      # DTOs class‑validator (request + query)
```

Reglas que respeta todo el código:

- Los servicios consumen configuración **solo** vía `ConfigService`, nunca `process.env`.
- Los servicios consumen Prisma **solo** vía `PrismaService` (no se instancia `PrismaClient` en módulos).
- La lógica de transición de estados (`defaultStageFor`, `isFirstResponseTransition`, `isClosingTransition`) vive en `applications/domain/status-resolver.service.ts` y se reutiliza desde el dashboard.
- Validaciones de vocabulario (slugs custom, orden, hidden, labels) viven en `platform-settings/domain/form-config.helpers.ts` y se aplican tanto al guardar `PlatformSettings` como al crear/actualizar `Application`/`SearchSession`.

### 3.2 Cross‑cutting

`src/main.ts` hace exactamente:

1. Crea Nest con `bufferLogs: true`.
2. Aplica `app.setGlobalPrefix('api')`.
3. Habilita CORS aceptando `CORS_ORIGIN` como lista separada por comas (`o.trim()`).
4. Registra `ValidationPipe({ whitelist, forbidNonWhitelisted, transform, transformOptions: { enableImplicitConversion: true } })`.
5. Registra `HttpExceptionFilter` global → respuesta uniforme `{ statusCode, message, error, path, timestamp }`. Loggea con stack solo cuando `status >= 500`.
6. Monta Swagger en `/api/docs` **excepto** en `production`.
7. Hace `app.listen(port)`.

`PaginationDto` es la base de todos los `Query` DTOs: `page` (≥1, default 1) y `limit` (1..200, default 25). El envelope de respuesta paginada es:

```ts
type PaginatedResult<T> = {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};
```

### 3.3 PrismaService y write‑mirror replica

`PrismaService` (en `@Global() PrismaModule`) extiende `PrismaClient` y, **si `DATABASE_URL_REPLICA` está seteada**, instala un middleware `$use(...)` que:

1. **Pre‑genera UUIDs** en `create` / `createMany` antes de delegar al primary, garantizando que primary y replica terminen con la misma PK.
2. Tras el éxito en primary, **encola** la misma operación contra la replica (operaciones del set `{create, createMany, update, updateMany, upsert, delete, deleteMany}`).
3. La cola es **serial** (`replicationQueue: Promise<void>` encadenado) para preservar orden de escritura y evitar carreras de FK.
4. Hace **`structuredClone(params.args)`** antes de encolar para no leer mutaciones in‑flight.
5. **Reintenta hasta 4 veces con backoff `100/250/500ms`** cuando el error es `P2003` (FK violated) — síntoma típico de hijo replicando antes que el padre.
6. Si la replica está caída al arrancar, loggea warning y la app sigue funcionando contra el primary (degradación grácil). Las lecturas **nunca** van a la replica.

La reconciliación off‑band se hace con los scripts `db:status`, `db:sync*` y `db:sync:incremental*` (ver §7.2).

### 3.4 Frontend

```
frontend/src/
├── main.tsx             React root + QueryClient + BrowserRouter + PlatformSettingsProvider + ThemeAwareToaster
├── App.tsx              tabla de rutas (todas dentro de <AppShell />)
├── api/                 axios client tipado por recurso (applications, dashboard, events, platform-settings, search-sessions, templates)
├── components/
│   ├── applications/    application-form, application-filters, application-row, status-changer, timeline
│   ├── dashboard/       activity-heatmap, distribution-bars, funnel-chart, kpi-card, time-series-chart
│   ├── layout/          app-shell, sidebar, page-header
│   ├── status/          status-badge
│   └── ui/              badge, button, card, empty-state, input, label, modal, select, spinner, textarea
├── context/             PlatformSettingsProvider (única fuente de vocabulario + tema)
├── hooks/               useDashboard, useApplications*, useEvents, useSearchSessions, useTemplates, useDebouncedValue
├── lib/                 api (axios + interceptor toast), query-client, apply-theme, theme-presets, chart-palette, form-defaults, form-select-options, cn, format
├── pages/               dashboard, applications/list, applications/detail, search-sessions, templates, settings
└── types/               enums, labels, models, platform-settings
```

Decisiones clave del frontend:

- **Único `QueryClient`** (`lib/query-client.ts`): `staleTime: 30_000`, `refetchOnWindowFocus: false`, `retry: 1` en queries, `retry: 0` en mutaciones.
- **Interceptor axios** (`lib/api.ts`): mapea el envelope de error backend a una `ApiError` tipada y emite un `sonner` toast con título contextual (`Connection error` / `Server error` / `Invalid request` / `Forbidden` / `Not found` / `Request failed`). Cuando el array `message` viene como string[] lo une con ` • `.
- **Theming dirigido por contexto**. El `<html>` lleva dos clases: `{appearanceMode} theme-preset-{themeId}` (ej. `dim theme-preset-emerald`). `applyDocumentTheme` limpia las viejas y persiste la elección en `localStorage` (`applyhub-theme`, `applyhub-appearance`).
- **Recharts theme‑aware**: `lib/chart-palette.ts` expone `chartColor(1..5)` que resuelve a `hsl(var(--chart-N))`. Cada preset redefine esos 5 stops + `--chart-foreground` para mantener contraste correcto.
- **Selectores vocabulario‑aware**: `PlatformSettingsProvider` materializa `methodSelectOptions`, `positionSelectOptions`, `employmentSelectOptions`, `searchPlatformSelectOptions`, `workModeSelectOptions`, `roleTitleOptions`, `resumeVersionOptions`. Renombrar/agregar/ocultar/reordenar en Settings se propaga **inmediatamente** a forms, filtros y vistas detalle.
- **Forms**: React Hook Form + Zod (`zodResolver`). El sentinel `'Unspecified'` en selects opcionales se mapea a `null` antes de enviar para no romper validadores estrictos del backend (URLs, emails).

---

## 4. Modelo de dominio

Definido en `backend/prisma/schema.prisma`. **6 agregados** (+ pivot implícito), todos con `@@map` snake_case e índices explícitos.

| Agregado | Rol | Campos relevantes |
| -------- | --- | ----------------- |
| `JobApplication` | Una oportunidad. Dueño de status, stage, priority, banda salarial, contacto denormalizado de la vacante y FK opcional a la sesión de búsqueda. | `position` / `applicationMethod` / `employmentType` / `platform` son **strings** (built‑in IDs **+** slugs custom de Settings). `workMode` es **enum estricto** (`remote` / `hybrid` / `onsite` / `unknown`). `postingLanguage` enum (`en`/`es`). Timestamps derivados por servicio: `firstResponseAt`, `lastActivityAt`, `closedAt`, `archivedAt`. |
| `JobSearchSession` | Búsqueda registrada (plataforma, query, filtros, ventana de publicación). Agrega las `JobApplication` que produjo. | `platform` (string), `platformOther` (solo cuando `platform === 'other'`), `queryTitle`, `filterDescription`, `jobPostedFrom` (date), `searchedAt`, `resultsApproxCount`, `isComplete`, `searchUrl`, `notes`. |
| `ApplicationEvent` | Timeline append‑only. Una fila por cada cambio de status/stage, mensaje, entrevista, nota, etc. | `type` (enum), `newStatus`, `newStage`, `channel`, `occurredAt`, `metadata` (JSONB con `previousStatus`/`previousStage` en transiciones). |
| `Contact` | Personas reutilizables (recruiters, hiring managers, referrals). | `name`, `role`, `companyName`, `email`, `phone`, `linkedinUrl`, `notes`. m:n con `JobApplication` via pivot implícito `_ApplicationContacts`. |
| `Template` | Copy reutilizable (cover letter, email, mensajes, follow‑up, ...). | `type`, `language`, `tags`, `usageCount`, `isFavorite`, `lastUsedAt`. |
| `PlatformSettings` | Fila única (`id="default"`) con preferencias UI + vocabulario. | `themeId` (12 valores, ver §6), `appearanceMode` (6 valores), `formConfig` JSONB (validado end‑to‑end, ver §4.4). |

**Cascadas relevantes**:

- `ApplicationEvent.application` → `onDelete: Cascade` (borrar una application borra su timeline).
- `JobApplication.jobSearchSession` → `onDelete: SetNull` (borrar una sesión deja las applications con `jobSearchSessionId = null`).

### 4.1 Pipeline de status

```
applied → acknowledged → screening → assessment → interview → offer → negotiating → accepted
                                                       ↘
                                       rejected | withdrawn | ghosted | on_hold
```

Definido en `application.enums.ts`:

- `ACTIVE_STATUSES` = `{applied, acknowledged, screening, assessment, interview, offer, negotiating, on_hold}`.
- `TERMINAL_STATUSES` = `{accepted, rejected, withdrawn, ghosted}`.
- `FUNNEL_ORDER` = `[applied, acknowledged, screening, assessment, interview, offer, negotiating, accepted]` — usado para conversión y "responded ≥ screening".

### 4.2 `StatusResolverService`

| Método | Comportamiento |
| ------ | -------------- |
| `defaultStageFor(status)` | Mapea status → stage canónico cuando el cliente no envía stage. `applied→submitted`, `acknowledged→auto_reply`, `screening→recruiter_screen`, `assessment→take_home`, `interview→tech_interview_1`, `offer→offer_received`, `negotiating→offer_negotiation`, `accepted→offer_accepted`, `rejected/withdrawn/ghosted/on_hold→closed`. |
| `isFirstResponseTransition(from, to)` | `true` solo si `from === 'applied'` y `to !== 'applied'` y `to !== 'ghosted'`. Cuando es `true` y `firstResponseAt` está vacío, `changeStatus` lo estampa. |
| `isClosingTransition(to)` | `true` para `accepted/rejected/withdrawn/ghosted`. Cuando es `true`, `closedAt = occurredAt`. **Si reabrís** a un status no‑terminal, `closedAt` se limpia. |

`firstResponseAt` también se completa cuando `ApplicationEventsService.create` recibe un evento de los tipos: `MESSAGE_RECEIVED`, `EMAIL_RECEIVED`, `INTERVIEW_SCHEDULED`, `ASSESSMENT_ASSIGNED`, `FEEDBACK_RECEIVED`, `OFFER_RECEIVED` (y solo si todavía estaba en null). Cualquier evento bumpea `lastActivityAt`.

### 4.3 Auto‑ghost

`POST /applications/mark-stale-ghosted?days=N` (default `21`):

1. Trae todas las applications con `status ∈ {applied, acknowledged}`.
2. Para cada una compara `lastActivityAt ?? applicationDate` contra `now - N días`.
3. Si está más vieja, replaya `changeStatus(id, { status: ghosted, stage: closed })` — así se emite el evento `ghosted_marked` normal en el timeline y se respeta toda la lógica transaccional.
4. Devuelve `{ ghostedCount }`.

### 4.4 Vocabularios configurables (`PlatformSettings.formConfig`)

`assertValidFormConfig` en `PlatformSettingsService` valida cada `PATCH /platform-settings`:

- **Slugs custom** (`customApplicationMethods`, `customPositionTypes`, `customEmploymentTypes`, `customSearchPlatforms`):
  - regex `/^[a-z][a-z0-9_]{0,47}$/` (≤ 48 chars).
  - no chocan con built‑ins (los enums Prisma).
  - sin duplicados dentro del array.
- **Orders** (`*Order`): si vienen, deben ser **una permutación completa** del universo `built‑in ∪ custom` (mismo length, sin duplicados, sin desconocidos).
- **Hidden** (`*Hidden`): subset del universo.
- **Labels** (`*Labels`): claves dentro del universo.
- `workModeLabels`: claves dentro del enum `WorkMode` (no admite slugs custom — work mode es enum estricto a propósito).
- `roleTitleOptions`: ≤ 80 entradas.
- `resumeVersionOptions`: ≤ 40 entradas.

Además, **cada write a `JobApplication`/`JobSearchSession` re‑valida** los selectores contra el `formConfig` actual:

- `ApplicationsService.assertApplicationSelectors` chequea `applicationMethod`, `position`, `employmentType`.
- `SearchSessionsService.assertSearchPlatform` chequea `platform`.

→ Si removés un slug custom desde Settings, **filas existentes lo conservan** pero **no podés crear nuevas** con ese valor.

---

## 5. HTTP API

Prefijo global: **`/api`**. Swagger en `/api/docs` (no producción). Todos los listados extienden `PaginationDto`. Errores siguen el envelope global; `404` se mapea desde `Prisma P2025`.

### 5.1 Applications — `/api/applications`

| Método | Path | Descripción |
| ------ | ---- | ----------- |
| `POST` | `/applications` | Crea. Valida selectores contra `formConfig`. Defaults: `applicationDate=hoy`, `vacancyPostedDate=applicationDate ?? hoy`, `stage=defaultStageFor(status)`, `lastActivityAt=now`. **En la misma transacción** crea un `ApplicationEvent` `application_submitted` con `metadata: { applicationMethod, source, platform }`. |
| `GET` | `/applications` | Listado paginado. Filtros: `search` (ILIKE en role/company/notes/location), `status[]`, `stage[]`, `position[]`, `method[]`, `workMode[]`, `priority[]`, `companyName` (ILIKE), `tags[]` (`hasSome`), `fromDate`/`toDate`, `onlyActive`, `includeArchived`. Sort: `applicationDate`/`createdAt`/`updatedAt`/`status`/`priority`/`lastActivityAt`, `asc`/`desc` (default `applicationDate desc`). Sin `includeArchived=true`, oculta archivadas. |
| `GET` | `/applications/:id` | Detalle con `contacts` y proyección slim de `jobSearchSession`. |
| `PATCH` | `/applications/:id` | Update parcial. **No** acepta `status`/`stage` (usar endpoint dedicado). Re‑valida selectores y FK de sesión. |
| `PATCH` | `/applications/:id/status` | Cambio de status/stage **transaccional**: actualiza `lastActivityAt`, condicionalmente `firstResponseAt`/`closedAt`, y emite **un** `ApplicationEvent` con `metadata.previousStatus`/`previousStage`. El `type` del evento se deriva del nuevo status (`offer→offer_received`, `accepted→offer_accepted`, `negotiating→offer_negotiated`, `rejected→rejected`, `withdrawn→withdrawn`, `ghosted→ghosted_marked`, resto → `status_changed`). |
| `PATCH` | `/applications/:id/contacts` | Reemplaza el set de contactos vinculados (semántica `set`). |
| `PATCH` | `/applications/:id/archive` / `/restore` | Soft archive (`archivedAt`). |
| `POST` | `/applications/mark-stale-ghosted?days=N` | Auto‑ghost masivo (default 21). Devuelve `{ ghostedCount }`. |
| `DELETE` | `/applications/:id` | Hard delete. Eventos cascadean. |

### 5.2 Application events

| Método | Path | Descripción |
| ------ | ---- | ----------- |
| `POST` | `/events` | Crea evento. Bumpea `lastActivityAt` y, si el `type` implica respuesta entrante (ver §4.2) y `firstResponseAt` está vacío, lo estampa. Todo en una transacción. |
| `GET` | `/applications/:applicationId/events` | Timeline (orden `occurredAt desc`). |
| `GET` | `/events/:id` / `DELETE` `/events/:id` | Fetch / delete estándar. |

### 5.3 Search sessions — `/api/search-sessions`

| Método | Path | Descripción |
| ------ | ---- | ----------- |
| `POST` | `/search-sessions` | Crea. Valida `platform` contra `formConfig`. `platformOther` solo persiste cuando `platform === 'other'`. `searchedAt` default `now`; `jobPostedFrom` default = día calendario de `searchedAt`. |
| `GET` | `/search-sessions` | Paginado. Filtros: `search` (ILIKE en queryTitle/filterDescription/notes/platformOther), `platform`, `fromDate`/`toDate`. Orden `searchedAt desc`. |
| `GET` | `/search-sessions/:id` | Detalle con `_count.applications`. |
| `PATCH` | `/search-sessions/:id` | Update parcial. Si cambiás `platform` a algo distinto de `other`, limpia `platformOther`. |
| `DELETE` | `/search-sessions/:id` | Borra. Las applications quedan con `jobSearchSessionId = null`. |

### 5.4 Contacts — `/api/contacts`

| Método | Path | Descripción |
| ------ | ---- | ----------- |
| `POST` | `/contacts` | Crea (trim de `companyName`). |
| `GET` | `/contacts` | Paginado. Filtros: `search` (ILIKE en name/email/title/companyName), `role`, `companyName`. Orden `name asc`. |
| `GET` / `PATCH` / `DELETE` | `/contacts/:id` | CRUD estándar. |

### 5.5 Templates — `/api/templates`

| Método | Path | Descripción |
| ------ | ---- | ----------- |
| `POST` | `/templates` | Crea. |
| `GET` | `/templates` | Paginado. Filtros: `search` (ILIKE en name/subject/body), `type`, `favoritesOnly`, `language`. Orden: `isFavorite desc, usageCount desc, updatedAt desc`. |
| `GET` / `PATCH` / `DELETE` | `/templates/:id` | CRUD estándar. |
| `PATCH` | `/templates/:id/favorite` | Toggle. |
| `PATCH` | `/templates/:id/used` | Increment `usageCount` y refresca `lastUsedAt` (la SPA lo llama al copiar). |

### 5.6 Dashboard — `/api/dashboard`

Ambos endpoints aceptan `fromDate`/`toDate` (YYYY‑MM‑DD).

| Método | Path | Salida |
| ------ | ---- | ------ |
| `GET` | `/dashboard` | Pipeline overview (ver detalle abajo). Excluye archivadas. |
| `GET` | `/dashboard/search-activity` | Métricas sobre `JobSearchSession`. |

**`GET /dashboard`** devuelve:

- `kpis`: `total`, `active`, `responded`, `interviewing`, `offers`, `accepted`, `rejected`, `ghosted`, `responseRate`, `interviewRate`, `offerRate`, `acceptanceRate`, `avgDaysToFirstResponse`, `avgDaysToOffer`. Una application cuenta como **responded** si tiene `firstResponseAt` **o** su `funnelIndex(status) ≥ funnelIndex(screening)` — así reclasificaciones manuales sin evento siguen contando.
- `byStatus` / `byPosition` / `byMethod` / `byWorkMode`: `{ key, count, percentage }[]` (ordenado desc por count).
- `funnel`: array siguiendo `FUNNEL_ORDER` con `count`, `conversionFromPrev`, `conversionFromTop` (1 decimal).
- `applicationsPerDay`: serie temporal sobre `applicationDate`.
- `activityHeatmap`: `$queryRaw` sobre `application_events` agrupado por `(EXTRACT(DOW), EXTRACT(HOUR))` — cubre **toda** actividad registrada, no solo submissions. Honra el rango.
- `methodEffectiveness`: por método → `total`, `responseRate`, `interviewRate`, `offerRate`, ordenado desc por volumen.
- `topCompanies`: top 10 por `applicationsCount` (key normalizada `trim().toLowerCase()`), con `activeCount`.
- `upcomingFollowUps`: cantidad de applications activas con `lastActivityAt ?? applicationDate` > 7 días.

**`GET /dashboard/search-activity`** devuelve `totalSessions`, `linkedApplicationsCount` (suma de `_count.applications`), `byPlatform`, `byCompletion` (`active` / `complete`), `searchesPerDay`, `topQueries` (top 15), `recentSessions` (últimas 20 con `applicationsCount`, `filterDescription`, `jobPostedFrom`, `resultsApproxCount`).

### 5.7 Platform settings — `/api/platform-settings`

| Método | Path | Descripción |
| ------ | ---- | ----------- |
| `GET` | `/platform-settings` | Devuelve la fila `default`, **creándola** en la primera llamada (`themeId: ocean`, `appearanceMode: dark`, `formConfig: {}`). |
| `PATCH` | `/platform-settings` | Update parcial. `themeId` ∈ {ocean, sky, indigo, violet, fuchsia, rose, coral, terracotta, amber, lime, emerald, slate}. `appearanceMode` ∈ {dark, night, dim, mist, soft, light}. `formConfig` validado end‑to‑end (§4.4). |

---

## 6. Frontend

### 6.1 Rutas

| Ruta | Archivo | Lo que hace |
| ---- | ------- | ----------- |
| `/` | `pages/dashboard.tsx` | Tabs **Pipeline** (KPIs, time series, funnel, distributions, heatmap, method effectiveness, top companies, quick action `mark stale as ghosted`) y **Search activity** (KPIs, sesiones/día, by platform, by completion, top queries, recent sessions). Date range aplica a ambos paneles (independientes en backend). |
| `/applications` | `pages/applications/list.tsx` | Filtros (`search` con debounce 300ms), paginación, modal de creación. |
| `/applications/:id` | `pages/applications/detail.tsx` | Header con `StatusBadge` + acciones (edit, archive/restore, delete con confirm), `StatusChanger`, `Timeline`, panel lateral con detalles + sesión de búsqueda + contacto vacante. |
| `/search-sessions` | `pages/search-sessions.tsx` | Sesiones logueadas con filtros y modal create/edit. Campo `platformOther` aparece solo cuando `platform === 'other'`. |
| `/templates` | `pages/templates.tsx` | Tabs por idioma (All / English / Spanish), filtros por type y favorites. Acciones de tarjeta: copy (auto‑increment `usageCount`), edit, favorite toggle, delete. |
| `/settings` | `pages/settings.tsx` | Appearance + color preset (apply en vivo); editores completos para application methods / position types / employment types / search platforms (reorder · rename · hide · add custom slug · remove custom); listas libres `roleTitleOptions` y `resumeVersionOptions`; overrides de `workModeLabels`. |

`AppShell` envuelve todas las rutas con `<Sidebar />` + `<main>` (max width 1400px). El sidebar es estático con 5 NavLink (Dashboard / Applications / Search sessions / Templates / Settings) más versión `v1.0.0`.

### 6.2 Theming

- 12 presets de color × 6 modos de apariencia → 72 combinaciones, cada una con sus propias variables CSS HSL en `index.css` (incluyendo `--chart-1..5` y `--chart-foreground` por preset).
- `applyDocumentTheme(themeId, appearance)` limpia y aplica las dos clases en `<html>`, persistiendo en `localStorage` (`applyhub-theme`, `applyhub-appearance`).
- `getAppliedThemeSnapshot()` reconstruye el snapshot leyendo `<html>.classList`, con fallback a `localStorage` y por último `(ocean, dark)`.
- `ThemeAwareToaster` (en `main.tsx`) elige tema `'light'` solo cuando appearance ∈ `{soft, light}`; resto `'dark'`.

### 6.3 Vocabulario unificado

`usePlatformSettings()` expone:

- Mapas `effective*Labels` (built‑in fusionado con overrides de `formConfig`).
- Listas ordenadas `*SelectOptions` (orden + hidden aplicados, slugs custom incluidos).
- Listas libres `roleTitleOptions` / `resumeVersionOptions` (con defaults `lib/form-defaults.ts` cuando settings no especifica).
- `updateSettings(input)` (mutación) + `isUpdating`.

Renombrar/agregar/ocultar/reordenar en Settings se refleja inmediatamente en formularios, filtros, badges y dashboard sin recargar.

---

## 7. Operación

### 7.1 Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

El contenedor backend en `target: development` ejecuta en orden:

```
prisma generate
node scripts/ensure-text-selector-columns.mjs   # idempotente: convierte enums PG legacy a VARCHAR sin pérdida
prisma db push                                  # crea tablas + enums (dev only — prod usa migrate deploy)
nest start --watch
```

Endpoints por defecto:

- Web — `http://localhost:5173`
- API — `http://localhost:3001/api`
- Swagger — `http://localhost:3001/api/docs`
- Postgres — `localhost:5432`

### 7.2 Local sin Docker

```bash
# Backend
cd backend
npm install                                # postinstall corre `prisma generate`
npx prisma db push                         # o npm run prisma:db:push (incluye ensure-text-selector-columns)
npm run start:dev

# Frontend
cd ../frontend
npm install
npm run dev
```

### 7.3 Configuración

Validada con Joi al boot (ver `backend/src/config/validation.schema.ts`):

| Variable | Default | Propósito |
| -------- | ------- | --------- |
| `NODE_ENV` | `development` | `production` apaga Swagger; en prod la imagen corre `prisma migrate deploy && node dist/main.js`. |
| `PORT` / `BACKEND_PORT` | `3001` | Nest lee `PORT`; compose mapea `BACKEND_PORT`. |
| `CORS_ORIGIN` | `http://localhost:5173` | Lista separada por comas. |
| `DATABASE_URL` | docker default | Postgres primary (requerido). |
| `DATABASE_URL_REPLICA` | `''` | Si está seteada, habilita el write‑mirror. |
| `DATABASE_LOGGING` | `false` | Cuando `true`, logs Prisma `query/info/warn/error`; si no, solo `error`. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | `applyhub` / `applyhub_dev` / `applyhub` / `5432` | Credenciales del contenedor compose. |
| `FRONTEND_PORT` | `5173` | Vite. |
| `VITE_API_URL` | `http://localhost:3001/api` | Base URL que llama la SPA. |

### 7.4 Scripts del backend (`cd backend`)

Desarrollo:

- `npm run start:dev` — Nest watch.
- `npm run build` / `npm run start:prod` — build a `dist/` y `node dist/main.js`.
- `npm run lint` / `npm run format`.

Prisma:

- `npm run prisma:generate` — regenerar el cliente.
- `npm run prisma:db:push` — `ensure-text-selector-columns` + `prisma db push` (dev, sin migración versionada).
- `npm run prisma:migrate:dev` / `prisma:migrate:deploy` — migraciones versionadas (deploy es el camino de producción).
- `npm run prisma:studio` — Prisma Studio. `prisma-studio-local.mjs` reescribe el host `postgres → 127.0.0.1` cuando se corre en host (no en contenedor).
- `npm run seed` — siembra los 12 templates EN/ES del `seed.ts`. Idempotente: si la tabla `templates` no está vacía, **skip**.

Replica (apuntan al `DATABASE_URL_REPLICA` mediante `run-on-replica.mjs`):

- `npm run prisma:db:push:replica`, `prisma:studio:replica`, `seed:replica`.

Ops sobre primary ↔ replica:

- `npm run db:status` — JSON con `counts` por modelo (incluyendo el pivot `_ApplicationContacts`) y `MAX(updatedAt)` por modelo en ambos lados, y un `sameCounts` boolean.
- `npm run db:sync:incremental:local-to-replica` / `replica-to-local` — paginado por `id ASC` (batch 200), upsert solo si `source.updatedAt > target.updatedAt`. Sincroniza también `_ApplicationContacts` con SQL crudo (`INSERT ... ON CONFLICT DO NOTHING`).
- `npm run db:sync:local-to-replica` / `replica-to-local` — snapshot completo via `pg_dump --no-owner --no-acl --clean --if-exists | psql --set=ON_ERROR_STOP=1` corriendo dentro de un `postgres:18-alpine` one‑off (no necesitás `pg_dump` en el host). Asume red `apply-hub_default` (override con `DOCKER_NETWORK`).

---

## 8. Replica — guía operacional

Lecturas siempre van al primary. La replica recibe writes asíncronamente vía middleware Prisma y sirve para recovery o lectura espejo. Los cambios de esquema deben aplicarse a **ambas** bases.

### 8.1 Habilitar

1. Conseguí la URL **externa** de la base secundaria (`?sslmode=require` para managed providers).
2. `DATABASE_URL_REPLICA=<url>` en `.env`.
3. Aplicá el esquema una vez:
   ```bash
   cd backend
   npm run prisma:db:push:replica
   ```
4. Reiniciá el backend. Buscá en logs `Prisma connected (replica)` (o un warning si no se pudo conectar — la app sigue contra primary).

### 8.2 Día a día

```bash
npm run db:status                                  # parity report
npm run db:sync:incremental:local-to-replica       # forward fix (más común)
npm run db:sync:incremental:replica-to-local       # backward fix (recovery)
```

Para drift severo o restore, usá las variantes snapshot (`db:sync:*`). Para "promover" la replica durante un outage del primary, swappeá `DATABASE_URL` a la URL de la replica y reiniciá.

### 8.3 Caveats

- **Eventually consistent**. Si la replica está caída, esos writes quedan pendientes de reconciliación manual con los scripts.
- **No hay replicación de esquema**. Migraciones contra el primary no tocan la replica — corré las equivalentes con `:replica`.
- **Single‑operator assumption**. Sin auth, único modelo de seguridad: el perímetro de red.

---

## 9. Producción

- Backend: `Dockerfile` target `production` corre `prisma migrate deploy && node dist/main.js` con dependencias prod‑only (`npm ci --omit=dev`). Usá migraciones versionadas (`npm run prisma:migrate:dev` durante el desarrollo para crear los archivos `migrations/`).
- Frontend: `Dockerfile` target `production` builda con Vite y sirve `dist/` desde `nginx:alpine` con `nginx.conf` que hace SPA fallback (`try_files $uri /index.html`).
- Swagger queda **deshabilitado** automáticamente cuando `NODE_ENV === 'production'`.
- Recordá poner `CORS_ORIGIN` apuntando al dominio público de la SPA (lista separada por comas si hay varios) y `VITE_API_URL` al dominio público de la API antes del `vite build`.
