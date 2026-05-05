import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { importEsm } from '../helpers/esm-import';
import { ALL_MODELS } from '../helpers/prisma-mock';

type SyncIncrementalModule = {
  BATCH_SIZE: number;
  MODELS: readonly string[];
  parseEnvFile: (path: string) => Record<string, string>;
  sanitizePgUrl: (raw: string) => string;
  localDatabaseUrlForHost: (
    raw: string,
    fileEnv?: Record<string, string>,
    opts?: { inDocker?: boolean; port?: string | number },
  ) => string;
  toMs: (value: string | Date) => number;
  shouldUpsert: (
    sourceRow: { updatedAt: Date | string },
    targetRow: { updatedAt: Date | string } | null | undefined,
  ) => boolean;
  splitCreateAndUpdate: <T extends { id: string }>(
    row: T,
  ) => { create: T; update: Omit<T, 'id'> };
  resolveDirection: (
    direction: string | undefined,
    urls: { localUrl: string | null; replicaUrl: string | null },
  ) => { sourceUrl: string | null; targetUrl: string | null };
  syncModel: (
    modelName: string,
    source: unknown,
    target: unknown,
    opts?: {
      log?: (
        modelName: string,
        progress: { scanned: number; upserted: number; done?: boolean },
      ) => void;
      batchSize?: number;
    },
  ) => Promise<{ scanned: number; upserted: number }>;
  syncApplicationContactsPivot: (
    source: unknown,
    target: unknown,
    opts?: { prune?: boolean },
  ) => Promise<{
    sourceCount: number;
    targetCount: number;
    inserted: number;
    pruned: number;
  }>;
  pruneOrphans: (
    modelName: string,
    source: unknown,
    target: unknown,
  ) => Promise<{ deleted: number }>;
};

const SCRIPT_PATH = join(
  __dirname,
  '..',
  '..',
  'scripts',
  'db-sync-incremental.mjs',
);

let mod: SyncIncrementalModule;

beforeAll(async () => {
  mod = await importEsm<SyncIncrementalModule>(
    pathToFileURL(SCRIPT_PATH).href,
  );
});

describe('db-sync-incremental.mjs', () => {
  describe('static metadata', () => {
    it('declares the canonical FK-safe model order including platformSettings', () => {
      expect(mod.MODELS).toEqual([
        'contact',
        'jobSearchSession',
        'jobApplication',
        'applicationEvent',
        'template',
        'platformSettings',
      ]);
    });

    it('covers every Prisma model the application uses', () => {
      expect([...mod.MODELS].sort()).toEqual([...ALL_MODELS].sort());
    });

    it('exposes a sensible BATCH_SIZE', () => {
      expect(mod.BATCH_SIZE).toBeGreaterThan(0);
      expect(mod.BATCH_SIZE).toBeLessThanOrEqual(1000);
    });
  });

  describe('shouldUpsert', () => {
    it('upserts when target is missing', () => {
      expect(
        mod.shouldUpsert({ updatedAt: '2025-01-01T00:00:00Z' }, undefined),
      ).toBe(true);
    });

    it('upserts when source is strictly newer', () => {
      expect(
        mod.shouldUpsert(
          { updatedAt: '2025-02-01T00:00:00Z' },
          { updatedAt: '2025-01-01T00:00:00Z' },
        ),
      ).toBe(true);
    });

    it('skips when source equals target', () => {
      expect(
        mod.shouldUpsert(
          { updatedAt: '2025-01-01T00:00:00Z' },
          { updatedAt: '2025-01-01T00:00:00Z' },
        ),
      ).toBe(false);
    });

    it('skips when source is older than target', () => {
      expect(
        mod.shouldUpsert(
          { updatedAt: '2024-12-31T00:00:00Z' },
          { updatedAt: '2025-01-01T00:00:00Z' },
        ),
      ).toBe(false);
    });
  });

  describe('splitCreateAndUpdate', () => {
    it('keeps id on create, strips id from update', () => {
      const row = { id: 'abc', name: 'X', updatedAt: 'now' };
      const { create, update } = mod.splitCreateAndUpdate(row);
      expect(create).toEqual(row);
      expect((update as { id?: string }).id).toBeUndefined();
      expect(update).toEqual({ name: 'X', updatedAt: 'now' });
    });
  });

  describe('resolveDirection', () => {
    it('local-to-replica wires source=local target=replica', () => {
      const r = mod.resolveDirection('local-to-replica', {
        localUrl: 'L',
        replicaUrl: 'R',
      });
      expect(r).toEqual({ sourceUrl: 'L', targetUrl: 'R' });
    });

    it('replica-to-local wires source=replica target=local', () => {
      const r = mod.resolveDirection('replica-to-local', {
        localUrl: 'L',
        replicaUrl: 'R',
      });
      expect(r).toEqual({ sourceUrl: 'R', targetUrl: 'L' });
    });

    it('returns nulls for unknown directions', () => {
      expect(
        mod.resolveDirection('garbage', { localUrl: 'L', replicaUrl: 'R' }),
      ).toEqual({ sourceUrl: null, targetUrl: null });
      expect(
        mod.resolveDirection(undefined, { localUrl: 'L', replicaUrl: 'R' }),
      ).toEqual({ sourceUrl: null, targetUrl: null });
    });
  });

  describe('sanitizePgUrl', () => {
    it('removes the schema query param', () => {
      const sanitized = mod.sanitizePgUrl(
        'postgresql://u:p@host:5432/db?schema=public&sslmode=require',
      );
      expect(sanitized).not.toContain('schema=');
      expect(sanitized).toContain('sslmode=require');
    });

    it('returns the original string when not a parseable URL', () => {
      expect(mod.sanitizePgUrl('not-a-url')).toBe('not-a-url');
    });
  });

  describe('localDatabaseUrlForHost', () => {
    it('rewrites compose hostname `postgres` → 127.0.0.1 with the published port', () => {
      const out = mod.localDatabaseUrlForHost(
        'postgresql://u:p@postgres:5432/db',
        { POSTGRES_PORT: '5433' },
        { inDocker: false },
      );
      expect(out).toContain('127.0.0.1');
      expect(out).toContain(':5433/');
    });

    it('does not touch URLs that do not use the compose hostname', () => {
      const url = 'postgresql://u:p@db.example.com:5432/db?sslmode=require';
      expect(
        mod.localDatabaseUrlForHost(url, {}, { inDocker: false }),
      ).toBe(url);
    });

    it('does nothing when running inside docker', () => {
      const url = 'postgresql://u:p@postgres:5432/db';
      expect(mod.localDatabaseUrlForHost(url, {}, { inDocker: true })).toBe(
        url,
      );
    });
  });

  describe('syncModel', () => {
    it('iterates pages, calls upsert only for newer source rows, returns counters', async () => {
      const sourceRows = [
        { id: 'a', updatedAt: new Date('2025-02-01T00:00:00Z') },
        { id: 'b', updatedAt: new Date('2025-02-01T00:00:00Z') },
        { id: 'c', updatedAt: new Date('2025-01-01T00:00:00Z') },
      ];
      const targetRowsById = new Map<
        string,
        { id: string; updatedAt: Date }
      >([
        // 'a' missing from target → upsert
        ['b', { id: 'b', updatedAt: new Date('2025-01-01T00:00:00Z') }], // older target → upsert
        ['c', { id: 'c', updatedAt: new Date('2025-02-01T00:00:00Z') }], // newer target → skip
      ]);

      let pageCalls = 0;
      const source = {
        contact: {
          findMany: jest.fn(async (args: { take: number }) => {
            pageCalls += 1;
            if (pageCalls === 1) return sourceRows;
            return [];
          }),
        },
      };
      const target = {
        contact: {
          findMany: jest.fn(async (args: { where: { id: { in: string[] } } }) => {
            return args.where.id.in
              .map((id) => targetRowsById.get(id))
              .filter(Boolean);
          }),
          upsert: jest.fn(async () => undefined),
        },
      };

      const result = await mod.syncModel('contact', source, target, {
        log: () => undefined,
        batchSize: 200,
      });

      expect(result).toEqual({ scanned: 3, upserted: 2 });
      expect(target.contact.upsert).toHaveBeenCalledTimes(2);
      const upsertedIds = (
        target.contact.upsert.mock.calls as unknown as Array<
          [{ where: { id: string } }]
        >
      ).map((call) => call[0].where.id);
      expect(new Set(upsertedIds)).toEqual(new Set(['a', 'b']));
    });

    it('paginates by id ASC across multiple batches', async () => {
      const allIds = ['a', 'b', 'c', 'd', 'e'];
      const allRows = allIds.map((id) => ({
        id,
        updatedAt: new Date('2025-02-01T00:00:00Z'),
      }));
      const source = {
        contact: {
          findMany: jest.fn(
            async (args: { where?: { id?: { gt: string } }; take: number }) => {
              const after = args.where?.id?.gt;
              const remaining = after
                ? allRows.filter((r) => r.id > after)
                : allRows;
              return remaining.slice(0, args.take);
            },
          ),
        },
      };
      const target = {
        contact: {
          findMany: jest.fn(async () => []),
          upsert: jest.fn(async () => undefined),
        },
      };

      const result = await mod.syncModel('contact', source, target, {
        log: () => undefined,
        batchSize: 2,
      });

      expect(result).toEqual({ scanned: 5, upserted: 5 });
      // batchSize=2 → 3 productive findMany calls + 1 closing empty page = 4
      expect(source.contact.findMany).toHaveBeenCalledTimes(4);
    });
  });

  describe('syncApplicationContactsPivot', () => {
    it('inserts rows missing on target and returns counters', async () => {
      const source = {
        $queryRawUnsafe: jest.fn(async () => [
          { A: 'a1', B: 'c1' },
          { A: 'a2', B: 'c2' },
        ]),
        $executeRawUnsafe: jest.fn(),
      };
      const target = {
        $queryRawUnsafe: jest.fn(async () => [{ A: 'a1', B: 'c1' }]),
        $executeRawUnsafe: jest.fn(async () => 1),
      };

      const out = await mod.syncApplicationContactsPivot(source, target);

      expect(out).toEqual({
        sourceCount: 2,
        targetCount: 1,
        inserted: 1,
        pruned: 0,
      });
      expect(target.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      const firstCall = target.$executeRawUnsafe.mock
        .calls[0] as unknown as [string, ...unknown[]];
      expect(firstCall[0]).toMatch(/INSERT INTO "_ApplicationContacts"/);
    });

    it('prunes rows present only on target when prune=true', async () => {
      const source = {
        $queryRawUnsafe: jest.fn(async () => [{ A: 'a1', B: 'c1' }]),
        $executeRawUnsafe: jest.fn(),
      };
      const target = {
        $queryRawUnsafe: jest.fn(async () => [
          { A: 'a1', B: 'c1' },
          { A: 'a9', B: 'c9' },
        ]),
        $executeRawUnsafe: jest.fn(async () => 1),
      };

      const out = await mod.syncApplicationContactsPivot(source, target, {
        prune: true,
      });

      expect(out.inserted).toBe(0);
      expect(out.pruned).toBe(1);
      const deleteCall = (
        target.$executeRawUnsafe.mock.calls as unknown as Array<
          [string, ...unknown[]]
        >
      ).find((call) => String(call[0]).includes('DELETE FROM'));
      expect(deleteCall).toBeDefined();
    });
  });

  describe('pruneOrphans', () => {
    it('deletes target ids that are not in source', async () => {
      const source = {
        contact: {
          findMany: jest.fn(async () => [{ id: 'a' }, { id: 'b' }]),
        },
      };
      const target = {
        contact: {
          findMany: jest.fn(async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
          deleteMany: jest.fn(async () => undefined),
        },
      };

      const result = await mod.pruneOrphans('contact', source, target);

      expect(result).toEqual({ deleted: 1 });
      expect(target.contact.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['c'] } },
      });
    });

    it('returns deleted=0 when source and target match', async () => {
      const source = {
        contact: {
          findMany: jest.fn(async () => [{ id: 'a' }]),
        },
      };
      const target = {
        contact: {
          findMany: jest.fn(async () => [{ id: 'a' }]),
          deleteMany: jest.fn(),
        },
      };

      const result = await mod.pruneOrphans('contact', source, target);
      expect(result).toEqual({ deleted: 0 });
      expect(target.contact.deleteMany).not.toHaveBeenCalled();
    });
  });
});
