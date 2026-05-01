#!/usr/bin/env node
/**
 * Runs any command with `DATABASE_URL` swapped to the value of
 * `DATABASE_URL_REPLICA` from the project root `.env`. Used to point Prisma
 * tooling (db push, studio, seed, ...) at the Render-hosted replica without
 * duplicating env files.
 *
 * Usage:
 *   node scripts/run-on-render.mjs <command> [args...]
 *
 * Example:
 *   node scripts/run-on-render.mjs npx prisma db push --skip-generate
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

const fileEnv = parseEnvFile(ENV_FILE);
const replicaUrl = process.env.DATABASE_URL_REPLICA || fileEnv.DATABASE_URL_REPLICA;

if (!replicaUrl) {
  console.error(
    '\u2717 DATABASE_URL_REPLICA is not set in .env (or current env).\n' +
      '  Add the Render external URL to .env and try again.',
  );
  process.exit(1);
}

const [, , command, ...args] = process.argv;
if (!command) {
  console.error('Usage: node scripts/run-on-render.mjs <command> [args...]');
  process.exit(1);
}

const env = {
  ...fileEnv,
  ...process.env,
  DATABASE_URL: replicaUrl,
};

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env,
  shell: true,
});

process.exit(result.status ?? 1);
