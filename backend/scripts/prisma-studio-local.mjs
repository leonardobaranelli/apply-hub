#!/usr/bin/env node
/**
 * Opens Prisma Studio against the same DB as docker-compose, but from the
 * host machine. Root `.env` uses hostname `postgres` (Docker network); that
 * host does not resolve on Windows/macOS/Linux host — use `localhost` + mapped
 * port instead.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function toHostDatabaseUrl(raw, postgresPort) {
  try {
    const u = new URL(raw);
    if (u.hostname === 'postgres') {
      u.hostname = '127.0.0.1';
      if (postgresPort) u.port = String(postgresPort);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

const fileEnv = parseEnvFile(ENV_FILE);
const baseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
if (!baseUrl) {
  console.error('✗ DATABASE_URL is not set (.env or environment).');
  process.exit(1);
}

const port = process.env.POSTGRES_PORT || fileEnv.POSTGRES_PORT || '5432';
/** Inside Docker, keep `postgres` hostname; on the host, map it to the published port. */
const inDocker = existsSync('/.dockerenv');
const databaseUrl = inDocker ? baseUrl : toHostDatabaseUrl(baseUrl, port);

const extraArgs = process.argv.slice(2);
const result = spawnSync('npx', ['prisma', 'studio', ...extraArgs], {
  stdio: 'inherit',
  env: {
    ...fileEnv,
    ...process.env,
    DATABASE_URL: databaseUrl,
  },
  shell: true,
});

process.exit(result.status ?? 1);
