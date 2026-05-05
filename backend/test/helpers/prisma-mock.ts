import { Prisma } from '@prisma/client';

/**
 * Names of the Prisma model delegates (lower-camelCase) that the application
 * uses. Mirrors the schema's `model` declarations and is the canonical list
 * the replica/sync scripts expect to see.
 */
export const ALL_MODELS = [
  'contact',
  'jobSearchSession',
  'jobApplication',
  'applicationEvent',
  'template',
  'platformSettings',
] as const;

export type ModelName = (typeof ALL_MODELS)[number];

/**
 * Prisma actions that mutate state. Kept here in addition to the runtime
 * `MUTATING_ACTIONS` set so tests can iterate them without importing prod code.
 */
export const ALL_MUTATING_ACTIONS: Prisma.PrismaAction[] = [
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
];

export const ALL_READ_ACTIONS: Prisma.PrismaAction[] = [
  'findUnique',
  'findFirst',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
];

type ModelDelegate = Record<string, jest.Mock>;
export type PrismaMock = Record<ModelName, ModelDelegate> & {
  $transaction: jest.Mock;
  $queryRawUnsafe: jest.Mock;
  $executeRawUnsafe: jest.Mock;
  $connect: jest.Mock;
  $disconnect: jest.Mock;
  $use: jest.Mock;
};

function buildModelDelegate(): ModelDelegate {
  const delegate: ModelDelegate = {};
  for (const action of [...ALL_MUTATING_ACTIONS, ...ALL_READ_ACTIONS]) {
    delegate[action] = jest.fn(async () => undefined);
  }
  return delegate;
}

/**
 * Build a deeply-mocked `PrismaService`-shaped object: every model exposes
 * Jest mocks for each Prisma action, plus the top-level `$transaction`,
 * `$queryRawUnsafe`, `$executeRawUnsafe` helpers used across the codebase.
 *
 * `$transaction` supports both the array form (`prisma.$transaction([...])`)
 * and the callback form (`prisma.$transaction(async (tx) => ...)`). In the
 * callback form `tx` IS the same mock, so spies remain visible to assertions.
 */
export function createPrismaMock(): PrismaMock {
  const mock: Partial<PrismaMock> = {};

  for (const model of ALL_MODELS) {
    mock[model] = buildModelDelegate();
  }

  mock.$queryRawUnsafe = jest.fn(async () => []);
  mock.$executeRawUnsafe = jest.fn(async () => 0);
  mock.$connect = jest.fn(async () => undefined);
  mock.$disconnect = jest.fn(async () => undefined);
  mock.$use = jest.fn();

  mock.$transaction = jest.fn(async (input: unknown) => {
    if (typeof input === 'function') {
      return await (input as (tx: PrismaMock) => Promise<unknown>)(
        mock as PrismaMock,
      );
    }
    if (Array.isArray(input)) {
      return Promise.all(input);
    }
    return input;
  });

  return mock as PrismaMock;
}

export type PrismaServiceLike = PrismaMock;
