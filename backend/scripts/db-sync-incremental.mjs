#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const ENV_FILE = resolve(ROOT, '.env');
const BATCH_SIZE = 200;

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

function sanitizePgUrl(raw) {
  try {
    const parsed = new URL(raw);
    parsed.searchParams.delete('schema');
    return parsed.toString();
  } catch {
    return raw;
  }
}

function toMs(value) {
  return new Date(value).getTime();
}

function shouldUpsert(sourceRow, targetRow) {
  if (!targetRow) return true;
  return toMs(sourceRow.updatedAt) > toMs(targetRow.updatedAt);
}

function splitCreateAndUpdate(row) {
  const create = { ...row };
  const update = { ...row };
  delete update.id;
  return { create, update };
}

const MODELS = [
  'contact',
  'jobSearchSession',
  'jobApplication',
  'applicationEvent',
  'template',
];

async function syncModel(modelName, source, target) {
  let lastId = null;
  let scanned = 0;
  let upserted = 0;

  while (true) {
    const where = lastId ? { id: { gt: lastId } } : undefined;

    const rows = await source[modelName].findMany({
      where,
      orderBy: [{ id: 'asc' }],
      take: BATCH_SIZE,
    });

    if (rows.length === 0) break;

    scanned += rows.length;

    const ids = rows.map((row) => row.id);
    const targetRows = await target[modelName].findMany({
      where: { id: { in: ids } },
      select: { id: true, updatedAt: true },
    });
    const targetById = new Map(targetRows.map((row) => [row.id, row]));

    for (const row of rows) {
      if (!shouldUpsert(row, targetById.get(row.id))) continue;
      const { create, update } = splitCreateAndUpdate(row);
      await target[modelName].upsert({
        where: { id: row.id },
        create,
        update,
      });
      upserted += 1;
    }

    const lastRow = rows[rows.length - 1];
    lastId = lastRow.id;

    process.stdout.write(
      `\r${modelName}: scanned ${scanned}, upserted ${upserted}`,
    );
  }

  process.stdout.write('\n');
  return { scanned, upserted };
}

async function syncApplicationContactsPivot(source, target) {
  // Prisma doesn't expose the implicit m:n pivot as a model, so we sync it with SQL.
  const sourceRows = await source.$queryRawUnsafe(
    'SELECT "A", "B" FROM "_ApplicationContacts"',
  );
  const targetRows = await target.$queryRawUnsafe(
    'SELECT "A", "B" FROM "_ApplicationContacts"',
  );

  const existing = new Set(targetRows.map((row) => `${row.A}|${row.B}`));
  let inserted = 0;

  for (const row of sourceRows) {
    const key = `${row.A}|${row.B}`;
    if (existing.has(key)) continue;
    await target.$executeRawUnsafe(
      'INSERT INTO "_ApplicationContacts" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING',
      row.A,
      row.B,
    );
    inserted += 1;
  }

  return { sourceCount: sourceRows.length, inserted };
}

async function run() {
  const fileEnv = parseEnvFile(ENV_FILE);
  const localUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
  const replicaUrl =
    process.env.DATABASE_URL_REPLICA || fileEnv.DATABASE_URL_REPLICA;

  if (!localUrl) throw new Error('DATABASE_URL is not set');
  if (!replicaUrl) throw new Error('DATABASE_URL_REPLICA is not set');

  const direction = process.argv[2];
  const sourceUrl =
    direction === 'local-to-replica'
      ? localUrl
      : direction === 'replica-to-local'
        ? replicaUrl
        : null;
  const targetUrl =
    direction === 'local-to-replica'
      ? replicaUrl
      : direction === 'replica-to-local'
        ? localUrl
        : null;

  if (!sourceUrl || !targetUrl) {
    throw new Error(
      'Usage: node scripts/db-sync-incremental.mjs <local-to-replica|replica-to-local>',
    );
  }

  const source = new PrismaClient({
    datasources: { db: { url: sanitizePgUrl(sourceUrl) } },
    log: ['error'],
  });
  const target = new PrismaClient({
    datasources: { db: { url: sanitizePgUrl(targetUrl) } },
    log: ['error'],
  });

  try {
    await source.$connect();
    await target.$connect();

    console.log(`→ Incremental sync ${direction}`);
    const summary = {};
    for (const model of MODELS) {
      summary[model] = await syncModel(model, source, target);
    }

    const pivotSummary = await syncApplicationContactsPivot(source, target);
    summary.applicationContactsPivot = pivotSummary;

    console.log('\n✓ Incremental sync complete');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

run().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
