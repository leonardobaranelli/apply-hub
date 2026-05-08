#!/usr/bin/env node
/**
 * Snapshot the entire local database into a single, self-contained JSON file.
 *
 * Usage:
 *   node scripts/db-snapshot/export-database.mjs [--out path/to/file.json]
 *
 * Notes:
 *   - The snapshot is intentionally schema-aware (uses Prisma Client) so we
 *     can later replay it through the backend services in
 *     `import-database.mjs` and benefit from the same defaults / validation.
 *   - All DateTime fields are serialised as ISO strings, all Decimals as
 *     stringified numbers (Prisma already returns Decimal-as-string on Json
 *     export). BigInt is preserved as a string suffix so it round-trips.
 *   - The JSON also stores the schema version (best-effort: latest applied
 *     Prisma migration name + git commit short sha if available) so the
 *     companion import script can warn / refuse on incompatible snapshots.
 *
 * Output structure (top-level keys):
 *   {
 *     "metadata": {
 *       "version": 1,
 *       "exportedAt": "2026-05-08T12:00:00.000Z",
 *       "schemaVersion": "20260508_..." | null,
 *       "gitCommit": "abc1234" | null,
 *       "tableOrder": [...]
 *     },
 *     "tables": {
 *       "platformSettings": [...],
 *       "contacts": [...],
 *       "jobSearchSessions": [...],
 *       "jobApplications": [...],
 *       "applicationEvents": [...],
 *       "templates": [...],
 *       "_relations": {
 *         "applicationContacts": [{ applicationId, contactId }]
 *       }
 *     }
 *   }
 */
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = resolve(__dirname, 'snapshots');

function parseArgs(argv) {
  const out = { outPath: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' || arg === '-o') {
      out.outPath = argv[i + 1];
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    }
  }
  return out;
}

function bestEffortGitCommit() {
  try {
    const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    });
    if (r.status === 0) return r.stdout.trim() || null;
  } catch {
    /* ignore */
  }
  return null;
}

async function bestEffortSchemaVersion(prisma) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT migration_name FROM "_prisma_migrations" ORDER BY finished_at DESC NULLS LAST LIMIT 1`,
    );
    if (Array.isArray(rows) && rows[0]?.migration_name) {
      return String(rows[0].migration_name);
    }
  } catch {
    /* table may not exist on db push workflows */
  }
  return null;
}

function defaultOutputPath() {
  const ts = new Date()
    .toISOString()
    .replace(/[:T.]/g, '-')
    .replace(/Z$/, '');
  return resolve(SNAPSHOTS_DIR, `apply-hub-${ts}.json`);
}

function jsonReplacer(_key, value) {
  if (typeof value === 'bigint') return `${value.toString()}n`;
  return value;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(
      'Usage: node scripts/db-snapshot/export-database.mjs [--out path]',
    );
    process.exit(0);
  }

  const outPath = args.outPath
    ? resolve(args.outPath)
    : defaultOutputPath();

  if (!existsSync(SNAPSHOTS_DIR)) {
    mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }

  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log('→ Exporting local database to JSON');
  console.log(`  output: ${outPath}`);

  try {
    const [
      platformSettings,
      contacts,
      jobSearchSessions,
      jobApplications,
      applicationEvents,
      templates,
    ] = await Promise.all([
      prisma.platformSettings.findMany({ orderBy: { id: 'asc' } }),
      prisma.contact.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.jobSearchSession.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.jobApplication.findMany({
        orderBy: { createdAt: 'asc' },
        include: { contacts: { select: { id: true } } },
      }),
      prisma.applicationEvent.findMany({ orderBy: { occurredAt: 'asc' } }),
      prisma.template.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);

    // Many-to-many bridge: applications ↔ contacts.
    const applicationContacts = [];
    const applications = [];
    for (const app of jobApplications) {
      const { contacts: linked, ...rest } = app;
      applications.push(rest);
      for (const c of linked ?? []) {
        applicationContacts.push({
          applicationId: app.id,
          contactId: c.id,
        });
      }
    }

    const schemaVersion = await bestEffortSchemaVersion(prisma);

    const snapshot = {
      metadata: {
        version: 1,
        exportedAt: new Date().toISOString(),
        schemaVersion,
        gitCommit: bestEffortGitCommit(),
        tableOrder: [
          'platformSettings',
          'contacts',
          'jobSearchSessions',
          'jobApplications',
          'applicationEvents',
          'templates',
          '_relations.applicationContacts',
        ],
        counts: {
          platformSettings: platformSettings.length,
          contacts: contacts.length,
          jobSearchSessions: jobSearchSessions.length,
          jobApplications: applications.length,
          applicationEvents: applicationEvents.length,
          templates: templates.length,
          applicationContacts: applicationContacts.length,
        },
      },
      tables: {
        platformSettings,
        contacts,
        jobSearchSessions,
        jobApplications: applications,
        applicationEvents,
        templates,
        _relations: {
          applicationContacts,
        },
      },
    };

    writeFileSync(outPath, JSON.stringify(snapshot, jsonReplacer, 2));

    console.log('\n✓ Snapshot written');
    for (const [k, v] of Object.entries(snapshot.metadata.counts)) {
      console.log(`  ${k.padEnd(20)} ${v}`);
    }
    if (schemaVersion) {
      console.log(`  schema version: ${schemaVersion}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n✗ Export failed:', err);
  process.exit(1);
});
