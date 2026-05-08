#!/usr/bin/env node
/**
 * Prisma `db push` cannot alter PostgreSQL native enums to VARCHAR in place — it wants to
 * drop/recreate columns ("data loss"). When upgrading from a schema that stored selectors as
 * enums, run this first so values are preserved via USING (...::text).
 *
 * Idempotent: skips when tables/columns are missing or columns are already varchar.
 *
 * Selectors migrated:
 *  - job_applications.position             → VARCHAR(48)
 *  - job_applications.employment_type      → VARCHAR(48)
 *  - job_applications.application_method   → VARCHAR(64)
 *  - job_applications.work_mode            → VARCHAR(32)
 *  - job_applications.status               → VARCHAR(48)
 *  - job_applications.stage                → VARCHAR(48)
 *  - application_events.new_status         → VARCHAR(48)
 *  - application_events.new_stage          → VARCHAR(48)
 *  - job_search_sessions.platform          → VARCHAR(48)
 *
 * After all enum→varchar conversions complete, orphan PG enum types are dropped
 * automatically by `prisma db push` because nothing references them anymore.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function tableExists(name) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS e
  `;
  return Boolean(rows[0]?.e);
}

/** Returns Prisma `data_type` from information_schema (e.g. USER-DEFINED for enums). */
async function columnDataType(table, column) {
  const rows = await prisma.$queryRaw`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
      AND column_name = ${column}
  `;
  return rows[0]?.data_type ?? null;
}

function isPgEnumColumn(dataType) {
  return dataType === 'USER-DEFINED';
}

async function run(sql, label) {
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log(`[ensure-text-selector-columns] ${label}`);
  } catch (err) {
    console.error(`[ensure-text-selector-columns] Failed: ${label}`, err);
    throw err;
  }
}

/**
 * Convert a `USER-DEFINED` (PG enum) column to VARCHAR(N), preserving values.
 * Optionally drops + restores a literal default to avoid the "default cannot
 * be cast" error.
 */
async function convertEnumToVarchar(table, column, varcharLength, defaultLiteral) {
  const dataType = await columnDataType(table, column);
  if (!dataType || !isPgEnumColumn(dataType)) return;

  if (defaultLiteral !== undefined) {
    await run(
      `ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP DEFAULT`,
      `drop default ${table}.${column}`,
    );
  }
  await run(
    `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE VARCHAR(${varcharLength}) USING ("${column}"::text)`,
    `${table}.${column} enum → varchar(${varcharLength})`,
  );
  if (defaultLiteral !== undefined) {
    await run(
      `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT '${defaultLiteral}'`,
      `set default ${table}.${column}`,
    );
  }
}

async function main() {
  await prisma.$connect();

  try {
    if (!(await tableExists('job_applications'))) {
      console.log(
        '[ensure-text-selector-columns] No job_applications table yet — skip (first deploy)',
      );
      return;
    }

    // Application form selectors
    await convertEnumToVarchar('job_applications', 'position', 48, 'backend');
    await convertEnumToVarchar('job_applications', 'employment_type', 48);
    await convertEnumToVarchar(
      'job_applications',
      'application_method',
      64,
      'linkedin_easy_apply',
    );
    await convertEnumToVarchar('job_applications', 'work_mode', 32, 'unknown');

    // Lifecycle selectors (status/stage)
    await convertEnumToVarchar('job_applications', 'status', 48, 'applied');
    await convertEnumToVarchar('job_applications', 'stage', 48, 'submitted');

    if (await tableExists('application_events')) {
      await convertEnumToVarchar('application_events', 'new_status', 48);
      await convertEnumToVarchar('application_events', 'new_stage', 48);
    }

    if (await tableExists('job_search_sessions')) {
      await convertEnumToVarchar(
        'job_search_sessions',
        'platform',
        48,
        'other',
      );
    }

    console.log('[ensure-text-selector-columns] Done');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
