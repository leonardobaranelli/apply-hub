# Database snapshot scripts

Two companion scripts that export the local database to a single JSON file
and replay it back through Prisma — useful when you need to nuke the local
DB after a schema change and recover all your data without losing fidelity.

| Script | Purpose |
| ------ | ------- |
| `export-database.mjs` | Dump every table the backend uses into a self-contained JSON snapshot under `snapshots/`. |
| `import-database.mjs` | Replay a snapshot into the **current** schema, dropping deprecated columns, applying defaults for new required columns, and rewiring application↔contact links. |

## Quick start

```bash
# 1) Snapshot the local DB
node backend/scripts/db-snapshot/export-database.mjs
# -> writes snapshots/apply-hub-2026-05-08-12-00-00-000.json

# 2) (optional) bump or replace the Prisma schema, recreate it
cd backend
npm run prisma:db:push

# 3) Restore data into the new schema
node scripts/db-snapshot/import-database.mjs \
  --in scripts/db-snapshot/snapshots/apply-hub-2026-05-08-12-00-00-000.json \
  --mode merge          # default; use --mode replace to truncate first
  # --dry-run           # validate only, don't write
```

The export captures `platformSettings`, `contacts`, `jobSearchSessions`,
`jobApplications`, `applicationEvents`, `templates`, plus the
`applicationContacts` many-to-many bridge. Prisma's runtime DMMF is used
during import to silently strip columns that no longer exist and to fall
back to schema defaults for new ones, so the snapshot stays compatible
across compatible refactors.
