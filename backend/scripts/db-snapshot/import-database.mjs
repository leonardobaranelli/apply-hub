#!/usr/bin/env node
/**
 * Replays a JSON snapshot produced by `export-database.mjs` into the local
 * database. The script is schema-aware: it inspects the live Prisma model
 * metadata to drop attributes that no longer exist, fall back to schema
 * defaults for new required fields, and preserve domain invariants
 * (timestamps, application ↔ contact links, application events, …).
 *
 * Usage:
 *   node scripts/db-snapshot/import-database.mjs --in path/to/snapshot.json
 *     [--mode merge|replace]      default: merge
 *     [--dry-run]                 only validate / report, no DB writes
 *     [--allow-schema-drift]      don't refuse on unknown tables
 *
 * Modes:
 *   merge    upsert every row by primary key. Existing rows are updated,
 *            missing rows are created. Safe for incremental restores.
 *   replace  truncate every snapshot-managed table (in dependency order)
 *            before inserting. Useful when you blew away the DB and want
 *            an exact restore.
 *
 * Field-level recovery rules:
 *   - Unknown columns (i.e. dropped from the new schema) are stripped
 *     silently (logged once per table for transparency).
 *   - Missing required columns fall back to the Prisma default (if any).
 *     If no default exists we abort and surface the offending row(s).
 *   - DateTime values are revived from ISO strings.
 *   - JSON fields are kept as-is.
 *   - The application-events trigger of `lastActivityAt` is *not* replayed
 *     because we already restore the persisted timestamp from the snapshot;
 *     this matches the source-of-truth view of the export.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const out = {
    inPath: null,
    mode: 'merge',
    dryRun: false,
    allowSchemaDrift: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--in' || arg === '-i') {
      out.inPath = argv[i + 1];
      i += 1;
    } else if (arg === '--mode' || arg === '-m') {
      out.mode = argv[i + 1];
      i += 1;
    } else if (arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg === '--allow-schema-drift') {
      out.allowSchemaDrift = true;
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    }
  }
  return out;
}

function jsonReviver(_key, value) {
  if (typeof value === 'string' && /^-?\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  return value;
}

/**
 * Pulls per-model field metadata out of the runtime Prisma DMMF so we can
 * reconcile snapshot rows against the *current* schema (the whole point of
 * this script).
 */
function buildModelMap(prisma) {
  const dmmf =
    prisma._baseDmmf?.datamodel ?? prisma._dmmf?.datamodel ?? Prisma.dmmf?.datamodel;
  if (!dmmf) {
    throw new Error(
      'Could not access Prisma DMMF (datamodel). Please run `prisma generate` and retry.',
    );
  }
  const models = new Map();
  for (const model of dmmf.models) {
    const scalarFieldNames = new Set();
    const requiredScalarFields = [];
    const fieldsWithDefault = new Set();
    const dateTimeFields = new Set();
    const decimalFields = new Set();
    const jsonFields = new Set();
    const relationFields = new Set();
    for (const f of model.fields) {
      if (f.kind === 'object') {
        relationFields.add(f.name);
        continue;
      }
      scalarFieldNames.add(f.name);
      if (f.type === 'DateTime') dateTimeFields.add(f.name);
      if (f.type === 'Decimal') decimalFields.add(f.name);
      if (f.type === 'Json') jsonFields.add(f.name);
      if (f.hasDefaultValue || f.isUpdatedAt) fieldsWithDefault.add(f.name);
      if (
        f.isRequired &&
        !f.hasDefaultValue &&
        !f.isUpdatedAt &&
        !f.isGenerated &&
        f.kind !== 'object'
      ) {
        requiredScalarFields.push(f.name);
      }
    }
    models.set(model.name, {
      scalarFieldNames,
      requiredScalarFields,
      fieldsWithDefault,
      dateTimeFields,
      decimalFields,
      jsonFields,
      relationFields,
      idField: model.fields.find((f) => f.isId)?.name ?? 'id',
    });
  }
  return models;
}

function reviveRow(row, meta) {
  const out = {};
  const droppedKeys = [];
  for (const [key, value] of Object.entries(row)) {
    if (!meta.scalarFieldNames.has(key)) {
      if (!meta.relationFields.has(key)) droppedKeys.push(key);
      continue;
    }
    if (value === null || value === undefined) {
      out[key] = value ?? null;
      continue;
    }
    if (meta.dateTimeFields.has(key)) {
      out[key] = new Date(value);
      continue;
    }
    if (meta.decimalFields.has(key)) {
      out[key] = new Prisma.Decimal(value);
      continue;
    }
    if (meta.jsonFields.has(key)) {
      out[key] = value;
      continue;
    }
    out[key] = value;
  }
  return { row: out, droppedKeys };
}

function assertRequiredFieldsCovered(rows, meta, modelName) {
  const offenders = [];
  for (const [idx, row] of rows.entries()) {
    const missing = meta.requiredScalarFields.filter(
      (name) => row[name] === undefined || row[name] === null,
    );
    if (missing.length > 0) {
      offenders.push({ idx, missing });
    }
  }
  if (offenders.length === 0) return;
  const sample = offenders.slice(0, 3);
  const detail = sample
    .map((o) => `    row #${o.idx}: missing ${o.missing.join(', ')}`)
    .join('\n');
  throw new Error(
    `Cannot import ${modelName}: ${offenders.length} row(s) lack required fields with no schema default.\n${detail}`,
  );
}

async function ensurePlatformSettingsRow(prisma, snapshotRows) {
  // Backend services boot with a guaranteed `default` row; mirror that
  // contract so the application keeps working after a partial restore.
  const existing = await prisma.platformSettings.findUnique({
    where: { id: 'default' },
  });
  const fromSnapshot = snapshotRows.find((r) => r.id === 'default');
  if (!existing && !fromSnapshot) {
    await prisma.platformSettings.create({
      data: {
        id: 'default',
        themeId: 'ocean',
        appearanceMode: 'dark',
        formConfig: {},
      },
    });
  }
}

async function importTable({
  prisma,
  modelName,
  delegate,
  rows,
  meta,
  mode,
  dryRun,
  log,
}) {
  if (!rows || rows.length === 0) {
    log(`  ${modelName.padEnd(20)} 0 rows (skipped)`);
    return;
  }
  const seenDropped = new Set();
  const prepared = [];
  for (const row of rows) {
    const { row: revived, droppedKeys } = reviveRow(row, meta);
    for (const k of droppedKeys) seenDropped.add(k);
    prepared.push(revived);
  }
  assertRequiredFieldsCovered(prepared, meta, modelName);

  if (seenDropped.size > 0) {
    log(
      `  ${modelName.padEnd(20)} dropped attributes (no longer in schema): ${[
        ...seenDropped,
      ].join(', ')}`,
    );
  }

  if (dryRun) {
    log(`  ${modelName.padEnd(20)} ${prepared.length} rows (dry-run)`);
    return;
  }

  const idField = meta.idField;
  let written = 0;
  for (const row of prepared) {
    if (mode === 'replace') {
      await delegate.create({ data: row });
    } else {
      const id = row[idField];
      if (id === undefined || id === null) {
        await delegate.create({ data: row });
      } else {
        await delegate.upsert({
          where: { [idField]: id },
          create: row,
          update: row,
        });
      }
    }
    written += 1;
  }
  log(`  ${modelName.padEnd(20)} ${written} rows`);
}

async function maybeReplaceTruncate(prisma, log) {
  // Order matters: child tables before parents to satisfy FKs.
  const sql = [
    'TRUNCATE TABLE "application_events" RESTART IDENTITY CASCADE',
    'TRUNCATE TABLE "_ApplicationContacts" CASCADE',
    'TRUNCATE TABLE "job_applications" RESTART IDENTITY CASCADE',
    'TRUNCATE TABLE "job_search_sessions" RESTART IDENTITY CASCADE',
    'TRUNCATE TABLE "contacts" RESTART IDENTITY CASCADE',
    'TRUNCATE TABLE "templates" RESTART IDENTITY CASCADE',
    'TRUNCATE TABLE "platform_settings" RESTART IDENTITY CASCADE',
  ];
  for (const stmt of sql) {
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (err) {
      // Some envs may not have every table yet; surface but continue.
      log(`  ! ${stmt} -> ${err.message}`);
    }
  }
}

async function importApplicationContacts(prisma, links, dryRun, log) {
  if (!links || links.length === 0) {
    log(`  ${'applicationContacts'.padEnd(20)} 0 links (skipped)`);
    return;
  }
  if (dryRun) {
    log(`  ${'applicationContacts'.padEnd(20)} ${links.length} links (dry-run)`);
    return;
  }
  let written = 0;
  for (const link of links) {
    try {
      await prisma.jobApplication.update({
        where: { id: link.applicationId },
        data: { contacts: { connect: { id: link.contactId } } },
      });
      written += 1;
    } catch (err) {
      log(
        `  ! could not link contact ${link.contactId} ↔ application ${link.applicationId}: ${err.message}`,
      );
    }
  }
  log(`  ${'applicationContacts'.padEnd(20)} ${written} links`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.inPath) {
    console.log(
      [
        'Usage: node scripts/db-snapshot/import-database.mjs --in path/to/snapshot.json',
        '       [--mode merge|replace] [--dry-run] [--allow-schema-drift]',
      ].join('\n'),
    );
    process.exit(args.help ? 0 : 1);
  }
  if (args.mode !== 'merge' && args.mode !== 'replace') {
    console.error(`✗ Invalid --mode '${args.mode}' (expected merge|replace)`);
    process.exit(1);
  }

  const inPath = resolve(args.inPath);
  if (!existsSync(inPath)) {
    console.error(`✗ Snapshot not found: ${inPath}`);
    process.exit(1);
  }

  const raw = readFileSync(inPath, 'utf-8');
  const snapshot = JSON.parse(raw, jsonReviver);
  if (snapshot?.metadata?.version !== 1 || !snapshot?.tables) {
    console.error('✗ Unrecognised snapshot format (expected metadata.version === 1)');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  await prisma.$connect();

  const models = buildModelMap(prisma);
  const log = (line) => console.log(line);

  console.log(`→ Importing snapshot from ${inPath}`);
  console.log(`  mode: ${args.mode}${args.dryRun ? ' (dry-run)' : ''}`);
  if (snapshot.metadata.schemaVersion) {
    console.log(`  source schema: ${snapshot.metadata.schemaVersion}`);
  }
  if (snapshot.metadata.gitCommit) {
    console.log(`  source commit: ${snapshot.metadata.gitCommit}`);
  }

  const knownTables = new Set([
    'platformSettings',
    'contacts',
    'jobSearchSessions',
    'jobApplications',
    'applicationEvents',
    'templates',
  ]);
  const incomingTables = Object.keys(snapshot.tables).filter(
    (t) => t !== '_relations',
  );
  const unknown = incomingTables.filter((t) => !knownTables.has(t));
  if (unknown.length > 0 && !args.allowSchemaDrift) {
    console.error(
      `✗ Snapshot contains unknown tables: ${unknown.join(', ')}\n` +
        '  Re-run with --allow-schema-drift to ignore them.',
    );
    process.exit(1);
  }

  try {
    if (args.mode === 'replace' && !args.dryRun) {
      console.log('  truncating destination tables…');
      await maybeReplaceTruncate(prisma, log);
    }

    const plan = [
      {
        modelName: 'PlatformSettings',
        delegate: prisma.platformSettings,
        rows: snapshot.tables.platformSettings,
        meta: models.get('PlatformSettings'),
      },
      {
        modelName: 'Contact',
        delegate: prisma.contact,
        rows: snapshot.tables.contacts,
        meta: models.get('Contact'),
      },
      {
        modelName: 'JobSearchSession',
        delegate: prisma.jobSearchSession,
        rows: snapshot.tables.jobSearchSessions,
        meta: models.get('JobSearchSession'),
      },
      {
        modelName: 'JobApplication',
        delegate: prisma.jobApplication,
        rows: snapshot.tables.jobApplications,
        meta: models.get('JobApplication'),
      },
      {
        modelName: 'ApplicationEvent',
        delegate: prisma.applicationEvent,
        rows: snapshot.tables.applicationEvents,
        meta: models.get('ApplicationEvent'),
      },
      {
        modelName: 'Template',
        delegate: prisma.template,
        rows: snapshot.tables.templates,
        meta: models.get('Template'),
      },
    ];

    for (const step of plan) {
      if (!step.meta) {
        if (!args.allowSchemaDrift) {
          throw new Error(
            `Snapshot references model ${step.modelName} which is missing in the live schema.`,
          );
        }
        log(`  ${step.modelName.padEnd(20)} skipped (model missing in schema)`);
        continue;
      }
      await importTable({
        prisma,
        modelName: step.modelName,
        delegate: step.delegate,
        rows: step.rows,
        meta: step.meta,
        mode: args.mode,
        dryRun: args.dryRun,
        log,
      });
    }

    await importApplicationContacts(
      prisma,
      snapshot.tables._relations?.applicationContacts ?? [],
      args.dryRun,
      log,
    );

    if (!args.dryRun) {
      await ensurePlatformSettingsRow(
        prisma,
        snapshot.tables.platformSettings ?? [],
      );
    }

    console.log('\n✓ Import complete');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n✗ Import failed:', err);
  process.exit(1);
});
