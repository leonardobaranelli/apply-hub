#!/usr/bin/env node
/**
 * Prisma `db push` cannot alter PostgreSQL native enums to VARCHAR in place — it wants to
 * drop/recreate columns ("data loss"). When upgrading from a schema that stored selectors as
 * enums, run this first so values are preserved via USING (...::text).
 *
 * Idempotent: skips when tables/columns are missing or columns are already varchar.
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

async function main() {
  await prisma.$connect();

  try {
    if (!(await tableExists('job_applications'))) {
      console.log(
        '[ensure-text-selector-columns] No job_applications table yet — skip (first deploy)',
      );
      return;
    }

    const posType = await columnDataType('job_applications', 'position');
    if (posType && isPgEnumColumn(posType)) {
      await run(
        `ALTER TABLE "job_applications" ALTER COLUMN "position" DROP DEFAULT`,
        'drop default position',
      );
      await run(
        `ALTER TABLE "job_applications" ALTER COLUMN "position" TYPE VARCHAR(48) USING ("position"::text)`,
        'position enum → varchar',
      );
      await run(
        `ALTER TABLE "job_applications" ALTER COLUMN "position" SET DEFAULT 'backend'`,
        'set default position',
      );
    }

    const empType = await columnDataType('job_applications', 'employment_type');
    if (empType && isPgEnumColumn(empType)) {
      await run(
        `ALTER TABLE "job_applications" ALTER COLUMN "employment_type" TYPE VARCHAR(48) USING ("employment_type"::text)`,
        'employment_type enum → varchar',
      );
    }

    const methodType = await columnDataType('job_applications', 'application_method');
    if (methodType && isPgEnumColumn(methodType)) {
      await run(
        `ALTER TABLE "job_applications" ALTER COLUMN "application_method" DROP DEFAULT`,
        'drop default application_method',
      );
      await run(
        `ALTER TABLE "job_applications" ALTER COLUMN "application_method" TYPE VARCHAR(64) USING ("application_method"::text)`,
        'application_method enum → varchar',
      );
      await run(
        `ALTER TABLE "job_applications" ALTER COLUMN "application_method" SET DEFAULT 'linkedin_easy_apply'`,
        'set default application_method',
      );
    }

    if (await tableExists('job_search_sessions')) {
      const platType = await columnDataType('job_search_sessions', 'platform');
      if (platType && isPgEnumColumn(platType)) {
        await run(
          `ALTER TABLE "job_search_sessions" ALTER COLUMN "platform" DROP DEFAULT`,
          'drop default platform',
        );
        await run(
          `ALTER TABLE "job_search_sessions" ALTER COLUMN "platform" TYPE VARCHAR(48) USING ("platform"::text)`,
          'platform enum → varchar',
        );
        await run(
          `ALTER TABLE "job_search_sessions" ALTER COLUMN "platform" SET DEFAULT 'other'`,
          'set default platform',
        );
      }
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
