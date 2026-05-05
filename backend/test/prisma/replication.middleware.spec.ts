import { Prisma } from '@prisma/client';
import {
  isRetryableReplicaError,
  MUTATING_ACTIONS,
  REPLICATED_MODELS,
  ReplicationMiddleware,
  ReplicaLikeClient,
  ReplicationLogger,
} from '../../src/prisma/replication.middleware';
import {
  ALL_MODELS,
  ALL_MUTATING_ACTIONS,
  ALL_READ_ACTIONS,
} from '../helpers/prisma-mock';

function buildReplicaMock(): ReplicaLikeClient {
  const replica: ReplicaLikeClient = {};
  for (const model of ALL_MODELS) {
    const delegate: Record<string, jest.Mock> = {};
    for (const action of [
      ...ALL_MUTATING_ACTIONS,
      ...ALL_READ_ACTIONS,
    ] as Prisma.PrismaAction[]) {
      delegate[action] = jest.fn(async () => ({ replica: true }));
    }
    replica[model] = delegate;
  }
  return replica;
}

function buildLogger(): jest.Mocked<ReplicationLogger> {
  return { warn: jest.fn() };
}

const SUPPORTED_MODELS_AS_PRISMA: Prisma.ModelName[] = [
  'Contact',
  'JobSearchSession',
  'JobApplication',
  'ApplicationEvent',
  'Template',
  'PlatformSettings',
];

describe('ReplicationMiddleware', () => {
  describe('static metadata', () => {
    it('declares all 6 supported models in lock-step with the schema', () => {
      expect([...REPLICATED_MODELS].sort()).toEqual(
        [...ALL_MODELS].sort(),
      );
    });

    it('flags every Prisma write action as mutating and every read as read-only', () => {
      for (const action of ALL_MUTATING_ACTIONS) {
        expect(MUTATING_ACTIONS.has(action)).toBe(true);
      }
      for (const action of ALL_READ_ACTIONS) {
        expect(MUTATING_ACTIONS.has(action)).toBe(false);
      }
    });
  });

  describe('shouldReplicate', () => {
    it('returns true only for mutating actions on a model', () => {
      const mw = new ReplicationMiddleware(
        buildReplicaMock(),
        buildLogger(),
      );
      for (const action of ALL_MUTATING_ACTIONS) {
        expect(
          mw.shouldReplicate({
            model: 'Contact',
            action,
            args: {},
            dataPath: [],
            runInTransaction: false,
          } as Prisma.MiddlewareParams),
        ).toBe(true);
      }
    });

    it('returns false for read-only actions', () => {
      const mw = new ReplicationMiddleware(
        buildReplicaMock(),
        buildLogger(),
      );
      for (const action of ALL_READ_ACTIONS) {
        expect(
          mw.shouldReplicate({
            model: 'Contact',
            action,
            args: {},
            dataPath: [],
            runInTransaction: false,
          } as Prisma.MiddlewareParams),
        ).toBe(false);
      }
    });

    it('returns false when no model is set (raw queries)', () => {
      const mw = new ReplicationMiddleware(
        buildReplicaMock(),
        buildLogger(),
      );
      expect(
        mw.shouldReplicate({
          model: undefined,
          action: 'queryRaw',
          args: {},
          dataPath: [],
          runInTransaction: false,
        } as unknown as Prisma.MiddlewareParams),
      ).toBe(false);
    });
  });

  describe('preGenerateIds', () => {
    it('injects a deterministic uuid on `create` when none is provided', () => {
      const mw = new ReplicationMiddleware(
        buildReplicaMock(),
        buildLogger(),
        { generateId: () => 'fixed-uuid' },
      );
      const params = {
        model: 'Contact',
        action: 'create',
        args: { data: { name: 'Ada' } },
        dataPath: [],
        runInTransaction: false,
      } as unknown as Prisma.MiddlewareParams;

      mw.preGenerateIds(params);

      expect(params.args.data.id).toBe('fixed-uuid');
    });

    it('respects an explicit id on `create`', () => {
      const mw = new ReplicationMiddleware(
        buildReplicaMock(),
        buildLogger(),
        { generateId: () => 'fixed-uuid' },
      );
      const params = {
        model: 'Contact',
        action: 'create',
        args: { data: { id: 'caller-id', name: 'Ada' } },
        dataPath: [],
        runInTransaction: false,
      } as unknown as Prisma.MiddlewareParams;

      mw.preGenerateIds(params);

      expect(params.args.data.id).toBe('caller-id');
    });

    it('injects ids per row on `createMany`', () => {
      let counter = 0;
      const mw = new ReplicationMiddleware(
        buildReplicaMock(),
        buildLogger(),
        { generateId: () => `id-${++counter}` },
      );
      const params = {
        model: 'Template',
        action: 'createMany',
        args: { data: [{ name: 'A' }, { name: 'B', id: 'keep' }, { name: 'C' }] },
        dataPath: [],
        runInTransaction: false,
      } as unknown as Prisma.MiddlewareParams;

      mw.preGenerateIds(params);

      expect(params.args.data[0].id).toBe('id-1');
      expect(params.args.data[1].id).toBe('keep');
      expect(params.args.data[2].id).toBe('id-2');
    });

    it('is a no-op for non-create actions', () => {
      const mw = new ReplicationMiddleware(
        buildReplicaMock(),
        buildLogger(),
        { generateId: () => 'should-not-fire' },
      );
      for (const action of ['update', 'delete', 'upsert'] as const) {
        const params = {
          model: 'Contact',
          action,
          args: { data: { name: 'Ada' } },
          dataPath: [],
          runInTransaction: false,
        } as unknown as Prisma.MiddlewareParams;
        mw.preGenerateIds(params);
        expect(params.args.data.id).toBeUndefined();
      }
    });
  });

  describe('middleware()', () => {
    it('runs the primary, then enqueues the same call against the replica', async () => {
      const replica = buildReplicaMock();
      const mw = new ReplicationMiddleware(replica, buildLogger());
      const next = jest.fn(async () => ({ id: 'primary' }));

      const params = {
        model: 'Contact',
        action: 'create',
        args: { data: { name: 'Ada' } },
        dataPath: [],
        runInTransaction: false,
      } as unknown as Prisma.MiddlewareParams;

      const result = await mw.middleware(params, next);
      await mw.drain();

      expect(result).toEqual({ id: 'primary' });
      expect(next).toHaveBeenCalledTimes(1);
      const replicaCreate = (replica.contact as Record<string, jest.Mock>)
        .create;
      expect(replicaCreate).toHaveBeenCalledTimes(1);
      // After preGenerateIds, args contain a generated id that the replica also receives.
      const calledWith = replicaCreate.mock.calls[0][0] as {
        data: { id: string; name: string };
      };
      expect(calledWith.data.name).toBe('Ada');
      expect(typeof calledWith.data.id).toBe('string');
    });

    it('does NOT call the replica for read actions', async () => {
      const replica = buildReplicaMock();
      const mw = new ReplicationMiddleware(replica, buildLogger());
      const next = jest.fn(async () => []);

      for (const action of ALL_READ_ACTIONS) {
        await mw.middleware(
          {
            model: 'Contact',
            action,
            args: {},
            dataPath: [],
            runInTransaction: false,
          } as Prisma.MiddlewareParams,
          next,
        );
      }
      await mw.drain();

      const contactDelegate = replica.contact as Record<string, jest.Mock>;
      for (const action of ALL_READ_ACTIONS) {
        expect(contactDelegate[action]).not.toHaveBeenCalled();
      }
    });

    it('preserves order across multiple writes (serial queue)', async () => {
      const order: string[] = [];
      const replica = buildReplicaMock();
      (replica.contact as Record<string, jest.Mock>).create = jest.fn(
        async (args: unknown) => {
          await new Promise((r) => setTimeout(r, 10));
          order.push(`contact:${(args as { data: { name: string } }).data.name}`);
        },
      );

      const mw = new ReplicationMiddleware(replica, buildLogger());
      const next = jest.fn(async () => undefined);

      await mw.middleware(
        {
          model: 'Contact',
          action: 'create',
          args: { data: { name: '1' } },
          dataPath: [],
          runInTransaction: false,
        } as unknown as Prisma.MiddlewareParams,
        next,
      );
      await mw.middleware(
        {
          model: 'Contact',
          action: 'create',
          args: { data: { name: '2' } },
          dataPath: [],
          runInTransaction: false,
        } as unknown as Prisma.MiddlewareParams,
        next,
      );
      await mw.middleware(
        {
          model: 'Contact',
          action: 'create',
          args: { data: { name: '3' } },
          dataPath: [],
          runInTransaction: false,
        } as unknown as Prisma.MiddlewareParams,
        next,
      );

      await mw.drain();

      expect(order).toEqual(['contact:1', 'contact:2', 'contact:3']);
    });

    it('snapshots args before queueing so later mutations on the original object do not bleed', async () => {
      const replica = buildReplicaMock();
      const mw = new ReplicationMiddleware(replica, buildLogger());

      const args = { data: { name: 'Ada' } };
      const params = {
        model: 'Contact',
        action: 'create',
        args,
        dataPath: [],
        runInTransaction: false,
      } as unknown as Prisma.MiddlewareParams;

      await mw.middleware(params, jest.fn(async () => undefined));
      // Mutate the original args BEFORE the queue runs.
      (args.data as { name: string }).name = 'Mutated';
      await mw.drain();

      const replicaCreate = (replica.contact as Record<string, jest.Mock>)
        .create;
      const received = replicaCreate.mock.calls[0][0] as {
        data: { name: string };
      };
      expect(received.data.name).toBe('Ada');
    });

    it('replicates writes across all 6 supported models for every mutating action', async () => {
      const replica = buildReplicaMock();
      const mw = new ReplicationMiddleware(replica, buildLogger());

      for (const model of SUPPORTED_MODELS_AS_PRISMA) {
        for (const action of ALL_MUTATING_ACTIONS) {
          await mw.middleware(
            {
              model,
              action,
              args: action === 'createMany'
                ? { data: [{ tag: model }] }
                : action === 'create'
                  ? { data: { tag: model } }
                  : { where: { id: 'x' }, data: { tag: model } },
              dataPath: [],
              runInTransaction: false,
            } as unknown as Prisma.MiddlewareParams,
            jest.fn(async () => undefined),
          );
        }
      }
      await mw.drain();

      const lowerFirst = (s: string) =>
        s.charAt(0).toLowerCase() + s.slice(1);

      for (const model of SUPPORTED_MODELS_AS_PRISMA) {
        const delegate = replica[lowerFirst(model)] as Record<
          string,
          jest.Mock
        >;
        for (const action of ALL_MUTATING_ACTIONS) {
          expect(delegate[action]).toHaveBeenCalledTimes(1);
        }
      }
    });

    it('logs a warning instead of throwing when replica delegate is missing', async () => {
      const logger = buildLogger();
      const replica: ReplicaLikeClient = {};
      const mw = new ReplicationMiddleware(replica, logger);

      await mw.middleware(
        {
          model: 'Contact',
          action: 'create',
          args: { data: { name: 'X' } },
          dataPath: [],
          runInTransaction: false,
        } as unknown as Prisma.MiddlewareParams,
        jest.fn(async () => undefined),
      );
      await mw.drain();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No replica delegate for Contact.create'),
      );
    });

    it('isolates the primary from replica failures (queue swallows them)', async () => {
      const logger = buildLogger();
      const replica = buildReplicaMock();
      (replica.contact as Record<string, jest.Mock>).create = jest.fn(
        async () => {
          throw new Error('replica down');
        },
      );

      const mw = new ReplicationMiddleware(replica, logger, {
        retryDelaysMs: [],
      });

      await mw.middleware(
        {
          model: 'Contact',
          action: 'create',
          args: { data: { name: 'X' } },
          dataPath: [],
          runInTransaction: false,
        } as unknown as Prisma.MiddlewareParams,
        jest.fn(async () => undefined),
      );
      await mw.drain();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Replication failed for Contact.create: replica down',
        ),
      );
    });
  });

  describe('retry behaviour', () => {
    it('retries on P2003 then succeeds', async () => {
      const replica = buildReplicaMock();
      let attempts = 0;
      (replica.applicationEvent as Record<string, jest.Mock>).create = jest.fn(
        async () => {
          attempts += 1;
          if (attempts < 3) {
            const err = new Error('Foreign key constraint violated') as Error & {
              code: string;
            };
            err.code = 'P2003';
            throw err;
          }
          return { id: 'ok' };
        },
      );

      const sleepMs: number[] = [];
      const mw = new ReplicationMiddleware(replica, buildLogger(), {
        retryDelaysMs: [10, 20, 30],
        sleep: async (ms) => {
          sleepMs.push(ms);
        },
      });

      await mw.middleware(
        {
          model: 'ApplicationEvent',
          action: 'create',
          args: { data: { applicationId: 'app-1' } },
          dataPath: [],
          runInTransaction: false,
        } as unknown as Prisma.MiddlewareParams,
        jest.fn(async () => undefined),
      );
      await mw.drain();

      expect(attempts).toBe(3);
      expect(sleepMs).toEqual([10, 20]);
    });

    it('gives up after the configured retries and logs a warning', async () => {
      const replica = buildReplicaMock();
      (replica.applicationEvent as Record<string, jest.Mock>).create = jest.fn(
        async () => {
          const err = new Error('Foreign key constraint violated') as Error & {
            code: string;
          };
          err.code = 'P2003';
          throw err;
        },
      );

      const logger = buildLogger();
      const mw = new ReplicationMiddleware(replica, logger, {
        retryDelaysMs: [1, 1],
        sleep: async () => undefined,
      });

      await mw.middleware(
        {
          model: 'ApplicationEvent',
          action: 'create',
          args: { data: { applicationId: 'app-1' } },
          dataPath: [],
          runInTransaction: false,
        } as unknown as Prisma.MiddlewareParams,
        jest.fn(async () => undefined),
      );
      await mw.drain();

      expect(
        (replica.applicationEvent as Record<string, jest.Mock>).create,
      ).toHaveBeenCalledTimes(3); // 1 attempt + 2 retries
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Replication failed'),
      );
    });

    it('does NOT retry on non-FK errors', async () => {
      const replica = buildReplicaMock();
      (replica.contact as Record<string, jest.Mock>).create = jest.fn(
        async () => {
          throw new Error('unique constraint');
        },
      );

      const mw = new ReplicationMiddleware(replica, buildLogger(), {
        retryDelaysMs: [1, 1],
        sleep: async () => undefined,
      });

      await mw.middleware(
        {
          model: 'Contact',
          action: 'create',
          args: { data: { name: 'X' } },
          dataPath: [],
          runInTransaction: false,
        } as unknown as Prisma.MiddlewareParams,
        jest.fn(async () => undefined),
      );
      await mw.drain();

      expect(
        (replica.contact as Record<string, jest.Mock>).create,
      ).toHaveBeenCalledTimes(1);
    });

    it('classifies P2003 / "Foreign key constraint violated" as retryable', () => {
      const fkErr = new Error('Foreign key constraint violated') as Error & {
        code?: string;
      };
      fkErr.code = 'P2003';
      expect(isRetryableReplicaError(fkErr)).toBe(true);

      const fkOnlyMessage = new Error('Foreign key constraint violated');
      expect(isRetryableReplicaError(fkOnlyMessage)).toBe(true);

      expect(isRetryableReplicaError(new Error('unique constraint'))).toBe(
        false,
      );
      expect(isRetryableReplicaError(undefined)).toBe(false);
    });
  });
});
