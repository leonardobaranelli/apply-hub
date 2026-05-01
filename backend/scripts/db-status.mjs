#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const ENV_FILE = resolve(ROOT, '.env');

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

async function collect(db) {
  const [contacts, apps, events, templates] = await Promise.all([
    db.contact.count(),
    db.jobApplication.count(),
    db.applicationEvent.count(),
    db.template.count(),
  ]);
  const [cMax, aMax, eMax, tMax] = await Promise.all([
    db.contact.aggregate({ _max: { updatedAt: true } }),
    db.jobApplication.aggregate({ _max: { updatedAt: true } }),
    db.applicationEvent.aggregate({ _max: { updatedAt: true } }),
    db.template.aggregate({ _max: { updatedAt: true } }),
  ]);
  const pivot =
    await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "_ApplicationContacts"`;

  return {
    counts: {
      contacts,
      jobApplications: apps,
      applicationEvents: events,
      templates,
      applicationContactsPivot: pivot[0]?.count ?? 0,
    },
    maxUpdatedAt: {
      contacts: cMax._max.updatedAt?.toISOString() ?? null,
      jobApplications: aMax._max.updatedAt?.toISOString() ?? null,
      applicationEvents: eMax._max.updatedAt?.toISOString() ?? null,
      templates: tMax._max.updatedAt?.toISOString() ?? null,
    },
  };
}

async function main() {
  const fileEnv = parseEnvFile(ENV_FILE);
  const localUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
  const renderUrl =
    process.env.DATABASE_URL_REPLICA || fileEnv.DATABASE_URL_REPLICA;
  if (!localUrl) throw new Error('DATABASE_URL is not set');
  if (!renderUrl) throw new Error('DATABASE_URL_REPLICA is not set');

  const local = new PrismaClient({
    datasources: { db: { url: sanitizePgUrl(localUrl) } },
    log: ['error'],
  });
  const render = new PrismaClient({
    datasources: { db: { url: sanitizePgUrl(renderUrl) } },
    log: ['error'],
  });

  try {
    await local.$connect();
    await render.$connect();
    const [localStats, renderStats] = await Promise.all([
      collect(local),
      collect(render),
    ]);
    const sameCounts =
      JSON.stringify(localStats.counts) === JSON.stringify(renderStats.counts);
    console.log(
      JSON.stringify(
        {
          sameCounts,
          local: localStats,
          render: renderStats,
        },
        null,
        2,
      ),
    );
  } finally {
    await local.$disconnect();
    await render.$disconnect();
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
