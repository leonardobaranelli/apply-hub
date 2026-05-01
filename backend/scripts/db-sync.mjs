#!/usr/bin/env node
/**
 * Bulk-copies data between the local primary database and the Render replica
 * using `pg_dump | psql` inside a one-off `postgres:18-alpine` container, so
 * you don't need pg_dump installed locally.
 *
 * Usage:
 *   node scripts/db-sync.mjs local-to-render   # mirror local -> render
 *   node scripts/db-sync.mjs render-to-local   # restore render -> local
 *
 * Requirements:
 *   - Docker is running.
 *   - `applyhub-postgres` container is up (so the docker-compose network exists).
 *   - DATABASE_URL and DATABASE_URL_REPLICA are set in `.env`.
 *
 * The docker-compose default network is `apply-hub_default`. Override with the
 * `DOCKER_NETWORK` env var if your project folder has a different name.
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

function redact(url) {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
}

function sanitizePgUrl(raw) {
  try {
    const parsed = new URL(raw);
    parsed.searchParams.delete('schema');
    return parsed.toString();
  } catch {
    return raw.replace(/([?&])schema=[^&]*(&|$)/, '$1').replace(/[?&]$/, '');
  }
}

const fileEnv = parseEnvFile(ENV_FILE);
const localUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
const renderUrl = process.env.DATABASE_URL_REPLICA || fileEnv.DATABASE_URL_REPLICA;
const network = process.env.DOCKER_NETWORK || 'apply-hub_default';

if (!localUrl) {
  console.error('\u2717 DATABASE_URL is not set in .env');
  process.exit(1);
}
if (!renderUrl) {
  console.error('\u2717 DATABASE_URL_REPLICA is not set in .env');
  process.exit(1);
}

const direction = process.argv[2];
let src;
let dst;
if (direction === 'local-to-render') {
  src = sanitizePgUrl(localUrl);
  dst = sanitizePgUrl(renderUrl);
} else if (direction === 'render-to-local') {
  src = sanitizePgUrl(renderUrl);
  dst = sanitizePgUrl(localUrl);
} else {
  console.error('Usage: node scripts/db-sync.mjs <local-to-render|render-to-local>');
  process.exit(1);
}

console.log(`\u2192 Syncing ${direction}`);
console.log(`  source: ${redact(src)}`);
console.log(`  target: ${redact(dst)}`);
console.log(`  docker network: ${network}`);
console.log('');

const dockerArgs = [
  'run',
  '--rm',
  '--network',
  network,
  '-e',
  `SRC=${src}`,
  '-e',
  `DST=${dst}`,
  'postgres:18-alpine',
  'sh',
  '-c',
  'set -o pipefail; pg_dump --no-owner --no-acl --clean --if-exists "$SRC" | sed "/^SET transaction_timeout =/d" | psql --set=ON_ERROR_STOP=1 "$DST"',
];

const result = spawnSync('docker', dockerArgs, { stdio: 'inherit' });

if (result.error) {
  if (result.error.code === 'ENOENT') {
    console.error(
      '\n✗ Docker CLI was not found in this environment.\n' +
        '  Run this command from your host machine (not from `docker compose exec backend ...`).\n' +
        '  Example: npm --prefix backend run db:sync:local-to-render',
    );
  } else {
    console.error(`\n✗ Sync failed before execution: ${result.error.message}`);
  }
  process.exit(1);
}

if (result.status === 0) {
  console.log('\n\u2713 Sync complete');
} else {
  console.error('\n\u2717 Sync failed (exit code ' + result.status + ')');
  process.exit(result.status ?? 1);
}
