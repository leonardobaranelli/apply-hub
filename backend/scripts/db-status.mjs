#!/usr/bin/env node
/**
 * Reports parity between primary and replica databases:
 *   - per-model row counts (including the implicit pivot `_ApplicationContacts`)
 *   - per-model `MAX(updated_at)` so you can tell if either side is stale
 *   - a top-level `sameCounts` flag for quick smoke-checks in CI/scripts
 *
 * Helpers and the model list are exported so they can be unit-tested without
 * actually opening database connections.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const ENV_FILE = resolve(ROOT, '.env');

/**
 * Models surfaced by the parity report. Must mirror the list in
 * `db-sync-incremental.mjs` so both scripts stay in lock-step with the
 * Prisma schema.
 */
export const MODELS = Object.freeze([
  'contact',
  'jobSearchSession',
  'jobApplication',
  'applicationEvent',
  'template',
  'platformSettings',
]);

/** Friendly labels used in the JSON report for the count + maxUpdatedAt sections. */
export const REPORT_KEYS = Object.freeze({
  contact: 'contacts',
  jobSearchSession: 'jobSearchSessions',
  jobApplication: 'jobApplications',
  applicationEvent: 'applicationEvents',
  template: 'templates',
  platformSettings: 'platformSettings',
});

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

/**
 * Collect a parity snapshot from a Prisma client. Pure async function over
 * the delegate names declared in `MODELS` — easy to mock in tests.
 */
export async function collect(db) {
  const counts = {};
  const maxUpdatedAt = {};

  await Promise.all(
    MODELS.map(async (model) => {
      const reportKey = REPORT_KEYS[model];
      const [count, agg] = await Promise.all([
        db[model].count(),
        db[model].aggregate({ _max: { updatedAt: true } }),
      ]);
      counts[reportKey] = count;
      const max = agg?._max?.updatedAt ?? null;
      maxUpdatedAt[reportKey] = max ? new Date(max).toISOString() : null;
    }),
  );

  const pivot = await db.$queryRawUnsafe(
    'SELECT COUNT(*)::int AS count FROM "_ApplicationContacts"',
  );
  counts.applicationContactsPivot = pivot[0]?.count ?? 0;

  return { counts, maxUpdatedAt };
}

export function diffSnapshots(local, replica) {
  return JSON.stringify(local.counts) === JSON.stringify(replica.counts);
}

export async function buildReport(localClient, replicaClient) {
  const [local, replica] = await Promise.all([
    collect(localClient),
    collect(replicaClient),
  ]);
  return {
    sameCounts: diffSnapshots(local, replica),
    local,
    replica,
  };
}

export async function main() {
  const fileEnv = parseEnvFile(ENV_FILE);
  const localUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
  const replicaUrl =
    process.env.DATABASE_URL_REPLICA || fileEnv.DATABASE_URL_REPLICA;
  if (!localUrl) throw new Error('DATABASE_URL is not set');
  if (!replicaUrl) throw new Error('DATABASE_URL_REPLICA is not set');

  const local = new PrismaClient({
    datasources: { db: { url: sanitizePgUrl(localUrl) } },
    log: ['error'],
  });
  const replica = new PrismaClient({
    datasources: { db: { url: sanitizePgUrl(replicaUrl) } },
    log: ['error'],
  });

  try {
    await local.$connect();
    await replica.$connect();
    const report = await buildReport(local, replica);
    console.log(JSON.stringify(report, null, 2));
    return report;
  } finally {
    await local.$disconnect();
    await replica.$disconnect();
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
  main().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
}
