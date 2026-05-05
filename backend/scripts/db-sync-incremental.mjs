#!/usr/bin/env node
/**
 * Incremental upsert sync via Prisma on the host. Unlike `db-sync.mjs`, this
 * does not run inside Docker, so `.env` URLs that use hostname `postgres`
 * (compose service name) must be rewritten to `127.0.0.1` + published port —
 * same rule as `prisma-studio-local.mjs`.
 *
 * Strategy:
 *   1. Iterate models in a FK-safe order (parents before children).
 *   2. For each model, page over source rows by `id ASC` (batch 200).
 *   3. Upsert into the target only when `source.updatedAt > target.updatedAt`
 *      (or when the target row is missing).
 *   4. Sync the implicit m:n pivot `_ApplicationContacts` last via raw SQL.
 *   5. Optionally prune target rows that no longer exist on the source.
 *
 * Helpers and the model list are exported so they can be unit-tested without
 * actually running the script (the main IIFE only runs when the file is
 * invoked directly, never when imported).
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const ENV_FILE = resolve(ROOT, '.env');

export const BATCH_SIZE = 200;

/**
 * FK-safe model order. Parents first, children later. The implicit pivot
 * `_ApplicationContacts` is intentionally NOT in this list because Prisma
 * does not expose it as a model — it is synced separately at the end.
 *
 * Order rationale:
 *  1. `contact`             — independent (also referenced by the pivot).
 *  2. `jobSearchSession`    — independent (parent of jobApplication.jobSearchSessionId, SetNull).
 *  3. `jobApplication`      — depends on jobSearchSession; parent of applicationEvent.
 *  4. `applicationEvent`    — depends on jobApplication (Cascade).
 *  5. `template`            — independent.
 *  6. `platformSettings`    — independent single-row settings store.
 */
export const MODELS = Object.freeze([
  'contact',
  'jobSearchSession',
  'jobApplication',
  'applicationEvent',
  'template',
  'platformSettings',
]);

export function parseEnvFile(path) {
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

export function sanitizePgUrl(raw) {
  try {
    const parsed = new URL(raw);
    parsed.searchParams.delete('schema');
    return parsed.toString();
  } catch {
    return raw;
  }
}

/** Map compose hostname `postgres` to the host-published port when not in a container. */
export function localDatabaseUrlForHost(raw, fileEnv = {}, opts = {}) {
  const inDocker = opts.inDocker ?? existsSync('/.dockerenv');
  if (inDocker) return raw;
  try {
    const u = new URL(raw);
    if (u.hostname !== 'postgres') return raw;
    const port =
      opts.port ?? process.env.POSTGRES_PORT ?? fileEnv.POSTGRES_PORT ?? '5432';
    u.hostname = '127.0.0.1';
    u.port = String(port);
    return u.toString();
  } catch {
    return raw;
  }
}

export function toMs(value) {
  return new Date(value).getTime();
}

export function shouldUpsert(sourceRow, targetRow) {
  if (!targetRow) return true;
  return toMs(sourceRow.updatedAt) > toMs(targetRow.updatedAt);
}

export function splitCreateAndUpdate(row) {
  const create = { ...row };
  const update = { ...row };
  delete update.id;
  return { create, update };
}

export function resolveDirection(direction, urls) {
  const { localUrl, replicaUrl } = urls;
  if (direction === 'local-to-replica') {
    return { sourceUrl: localUrl, targetUrl: replicaUrl };
  }
  if (direction === 'replica-to-local') {
    return { sourceUrl: replicaUrl, targetUrl: localUrl };
  }
  return { sourceUrl: null, targetUrl: null };
}

/**
 * Sync a single Prisma model from source to target. Returns counters.
 *
 * - Pages by `id ASC` so we don't load everything in memory.
 * - Skips rows that target already has with a newer/equal `updatedAt`.
 * - Caller decides FK-safe order (see `MODELS`).
 */
export async function syncModel(modelName, source, target, opts = {}) {
  const log = opts.log ?? defaultProgressLogger();
  const batchSize = opts.batchSize ?? BATCH_SIZE;

  let lastId = null;
  let scanned = 0;
  let upserted = 0;

  for (;;) {
    const where = lastId ? { id: { gt: lastId } } : undefined;

    const rows = await source[modelName].findMany({
      where,
      orderBy: [{ id: 'asc' }],
      take: batchSize,
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

    lastId = rows[rows.length - 1].id;
    log(modelName, { scanned, upserted });
  }

  log(modelName, { scanned, upserted, done: true });
  return { scanned, upserted };
}

/**
 * Sync the implicit Prisma m:n pivot `_ApplicationContacts`. Prisma does not
 * expose this as a model, so we use raw SQL.
 *
 * - Inserts pivot rows that exist in source but not in target.
 * - Optionally prunes pivot rows present only in target.
 */
export async function syncApplicationContactsPivot(source, target, opts = {}) {
  const sourceRows = await source.$queryRawUnsafe(
    'SELECT "A", "B" FROM "_ApplicationContacts"',
  );
  const targetRows = await target.$queryRawUnsafe(
    'SELECT "A", "B" FROM "_ApplicationContacts"',
  );

  const sourceKeys = new Set(sourceRows.map((row) => `${row.A}|${row.B}`));
  const targetKeys = new Set(targetRows.map((row) => `${row.A}|${row.B}`));

  let inserted = 0;
  for (const row of sourceRows) {
    const key = `${row.A}|${row.B}`;
    if (targetKeys.has(key)) continue;
    await target.$executeRawUnsafe(
      'INSERT INTO "_ApplicationContacts" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING',
      row.A,
      row.B,
    );
    inserted += 1;
  }

  let pruned = 0;
  if (opts.prune) {
    for (const row of targetRows) {
      const key = `${row.A}|${row.B}`;
      if (sourceKeys.has(key)) continue;
      await target.$executeRawUnsafe(
        'DELETE FROM "_ApplicationContacts" WHERE "A" = $1 AND "B" = $2',
        row.A,
        row.B,
      );
      pruned += 1;
    }
  }

  return {
    sourceCount: sourceRows.length,
    targetCount: targetRows.length,
    inserted,
    pruned,
  };
}

/**
 * Optional pass: delete target rows whose ids do not exist on the source.
 * Disabled by default to keep the script's contract additive — opt-in via
 * the `--prune` flag.
 *
 * Children must be pruned before parents (reverse of `MODELS`).
 */
export async function pruneOrphans(modelName, source, target) {
  const sourceIds = new Set(
    (await source[modelName].findMany({ select: { id: true } })).map((r) => r.id),
  );
  const targetIds = (
    await target[modelName].findMany({ select: { id: true } })
  ).map((r) => r.id);

  const toDelete = targetIds.filter((id) => !sourceIds.has(id));
  if (toDelete.length === 0) return { deleted: 0 };

  await target[modelName].deleteMany({ where: { id: { in: toDelete } } });
  return { deleted: toDelete.length };
}

function defaultProgressLogger() {
  return (modelName, { scanned, upserted, done }) => {
    process.stdout.write(
      `\r${modelName}: scanned ${scanned}, upserted ${upserted}`,
    );
    if (done) process.stdout.write('\n');
  };
}

export async function run({ direction, prune = false } = {}) {
  const fileEnv = parseEnvFile(ENV_FILE);
  const localUrl = localDatabaseUrlForHost(
    process.env.DATABASE_URL || fileEnv.DATABASE_URL,
    fileEnv,
  );
  const replicaUrl =
    process.env.DATABASE_URL_REPLICA || fileEnv.DATABASE_URL_REPLICA;

  if (!localUrl) throw new Error('DATABASE_URL is not set');
  if (!replicaUrl) throw new Error('DATABASE_URL_REPLICA is not set');

  const { sourceUrl, targetUrl } = resolveDirection(direction, {
    localUrl,
    replicaUrl,
  });

  if (!sourceUrl || !targetUrl) {
    throw new Error(
      'Usage: node scripts/db-sync-incremental.mjs <local-to-replica|replica-to-local> [--prune]',
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

    console.log(`→ Incremental sync ${direction}${prune ? ' (with prune)' : ''}`);
    const summary = {};
    for (const model of MODELS) {
      summary[model] = await syncModel(model, source, target);
    }

    summary.applicationContactsPivot = await syncApplicationContactsPivot(
      source,
      target,
      { prune },
    );

    if (prune) {
      const pruneSummary = {};
      for (const model of [...MODELS].reverse()) {
        pruneSummary[model] = await pruneOrphans(model, source, target);
      }
      summary.prune = pruneSummary;
    }

    console.log('\n✓ Incremental sync complete');
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

function isMainModule() {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const direction = process.argv[2];
  const prune = process.argv.includes('--prune');
  run({ direction, prune }).catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
}
