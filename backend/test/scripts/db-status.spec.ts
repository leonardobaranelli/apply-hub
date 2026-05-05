import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { importEsm } from '../helpers/esm-import';
import { ALL_MODELS } from '../helpers/prisma-mock';

type DbStatusModule = {
  MODELS: readonly string[];
  REPORT_KEYS: Record<string, string>;
  parseEnvFile: (path: string) => Record<string, string>;
  sanitizePgUrl: (raw: string) => string;
  collect: (db: unknown) => Promise<{
    counts: Record<string, number>;
    maxUpdatedAt: Record<string, string | null>;
  }>;
  diffSnapshots: (
    a: { counts: Record<string, number> },
    b: { counts: Record<string, number> },
  ) => boolean;
  buildReport: (local: unknown, replica: unknown) => Promise<{
    sameCounts: boolean;
    local: { counts: Record<string, number> };
    replica: { counts: Record<string, number> };
  }>;
};

const SCRIPT_PATH = join(
  __dirname,
  '..',
  '..',
  'scripts',
  'db-status.mjs',
);

let mod: DbStatusModule;

function buildPrismaMock(rows: Record<string, number>): unknown {
  const client: Record<string, unknown> = {};
  for (const model of ALL_MODELS) {
    client[model] = {
      count: jest.fn(async () => rows[model] ?? 0),
      aggregate: jest.fn(async () => ({
        _max: { updatedAt: new Date('2025-04-01T00:00:00Z') },
      })),
    };
  }
  client.$queryRawUnsafe = jest.fn(async () => [{ count: rows.pivot ?? 0 }]);
  return client;
}

beforeAll(async () => {
  mod = await importEsm<DbStatusModule>(pathToFileURL(SCRIPT_PATH).href);
});

describe('db-status.mjs', () => {
  it('declares the same canonical model list as the incremental sync script', () => {
    expect([...mod.MODELS].sort()).toEqual([...ALL_MODELS].sort());
  });

  it('reports keys cover every supported model (including platformSettings)', () => {
    expect(Object.keys(mod.REPORT_KEYS).sort()).toEqual(
      [...ALL_MODELS].sort(),
    );
    expect(mod.REPORT_KEYS.platformSettings).toBeDefined();
  });

  it('collect returns counts + maxUpdatedAt for every model and the pivot', async () => {
    const client = buildPrismaMock({
      contact: 3,
      jobSearchSession: 4,
      jobApplication: 5,
      applicationEvent: 6,
      template: 7,
      platformSettings: 1,
      pivot: 2,
    });

    const snapshot = await mod.collect(client);

    expect(snapshot.counts).toEqual({
      contacts: 3,
      jobSearchSessions: 4,
      jobApplications: 5,
      applicationEvents: 6,
      templates: 7,
      platformSettings: 1,
      applicationContactsPivot: 2,
    });

    for (const value of Object.values(snapshot.maxUpdatedAt)) {
      expect(typeof value === 'string').toBe(true);
      expect(value).toMatch(/^2025-04-01T00:00:00\.000Z$/);
    }
    expect(Object.keys(snapshot.maxUpdatedAt)).toEqual(
      expect.arrayContaining([
        'contacts',
        'jobSearchSessions',
        'jobApplications',
        'applicationEvents',
        'templates',
        'platformSettings',
      ]),
    );
  });

  it('diffSnapshots compares only the counts payload', () => {
    expect(
      mod.diffSnapshots(
        { counts: { contacts: 1 } },
        { counts: { contacts: 1 } },
      ),
    ).toBe(true);
    expect(
      mod.diffSnapshots(
        { counts: { contacts: 1 } },
        { counts: { contacts: 2 } },
      ),
    ).toBe(false);
  });

  it('buildReport composes a parity result for both sides', async () => {
    const local = buildPrismaMock({
      contact: 1,
      jobSearchSession: 1,
      jobApplication: 1,
      applicationEvent: 1,
      template: 1,
      platformSettings: 1,
      pivot: 1,
    });
    const replica = buildPrismaMock({
      contact: 1,
      jobSearchSession: 1,
      jobApplication: 1,
      applicationEvent: 1,
      template: 1,
      platformSettings: 1,
      pivot: 1,
    });

    const report = await mod.buildReport(local, replica);

    expect(report.sameCounts).toBe(true);
    expect(report.local.counts.platformSettings).toBe(1);
    expect(report.replica.counts.platformSettings).toBe(1);
  });

  it('buildReport reports drift when counts diverge', async () => {
    const local = buildPrismaMock({
      contact: 5,
      jobSearchSession: 1,
      jobApplication: 1,
      applicationEvent: 1,
      template: 1,
      platformSettings: 1,
      pivot: 1,
    });
    const replica = buildPrismaMock({
      contact: 1,
      jobSearchSession: 1,
      jobApplication: 1,
      applicationEvent: 1,
      template: 1,
      platformSettings: 1,
      pivot: 1,
    });

    const report = await mod.buildReport(local, replica);

    expect(report.sameCounts).toBe(false);
    expect(report.local.counts.contacts).toBe(5);
    expect(report.replica.counts.contacts).toBe(1);
  });
});
