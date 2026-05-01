import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config/configuration';

/**
 * Prisma actions that mutate state and therefore need to be replicated to the
 * secondary database. Read-only operations are intentionally excluded.
 */
const MUTATING_ACTIONS = new Set<Prisma.PrismaAction>([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly replicaUrl: string | null;
  private replica: PrismaClient | null = null;
  private replicationQueue: Promise<void> = Promise.resolve();

  constructor(configService: ConfigService<AppConfig, true>) {
    const logging = configService.get('database.logging', { infer: true });
    const log: Prisma.LogLevel[] = logging
      ? ['query', 'info', 'warn', 'error']
      : ['error'];
    super({ log });

    this.replicaUrl = configService.get('database.replicaUrl', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected (primary)');

    if (this.replicaUrl) {
      await this.initializeReplica(this.replicaUrl);
    } else {
      this.logger.log('No replica configured (DATABASE_URL_REPLICA not set)');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.replicationQueue.catch(() => undefined);
    await this.$disconnect();
    if (this.replica) {
      await this.replica.$disconnect().catch(() => undefined);
    }
  }

  /**
   * Tries to connect to the replica and installs the replication middleware
   * if successful. If the replica is unreachable on startup the app keeps
   * running normally against the primary (graceful degradation).
   */
  private async initializeReplica(url: string): Promise<void> {
    const replica = new PrismaClient({
      datasources: { db: { url } },
      log: ['error'],
    });

    try {
      await replica.$connect();
      this.replica = replica;
      this.logger.log('Prisma connected (replica)');
      this.installReplicationMiddleware();
    } catch (err) {
      this.logger.warn(
        `Replica unavailable, replication disabled: ${(err as Error).message}`,
      );
      await replica.$disconnect().catch(() => undefined);
      this.replica = null;
    }
  }

  /**
   * Installs a Prisma middleware that:
   *   1) Pre-generates UUIDs for `create` / `createMany` so the same row gets
   *      the same primary key on both databases.
   *   2) After the primary write succeeds, enqueues the same operation against
   *      the replica. Queueing keeps write order and avoids FK race conditions.
   *
   * Errors on the replica are logged but never propagate — the primary is the
   * source of truth, and the manual `db:sync` script can reconcile drift.
   */
  private installReplicationMiddleware(): void {
    this.$use(async (params, next) => {
      this.preGenerateIds(params);

      const result = await next(params);

      if (
        this.replica &&
        params.model &&
        MUTATING_ACTIONS.has(params.action)
      ) {
        this.enqueueReplication(params);
      }

      return result;
    });
  }

  private preGenerateIds(params: Prisma.MiddlewareParams): void {
    if (!this.replica) return;

    if (params.action === 'create') {
      const data = params.args?.data;
      if (data && typeof data === 'object' && !Array.isArray(data) && !data.id) {
        data.id = randomUUID();
      }
    } else if (params.action === 'createMany') {
      const data = params.args?.data;
      if (Array.isArray(data)) {
        for (const row of data) {
          if (row && typeof row === 'object' && !row.id) {
            row.id = randomUUID();
          }
        }
      }
    }
  }

  private async replicateToReplica(
    params: Prisma.MiddlewareParams,
  ): Promise<void> {
    if (!this.replica || !params.model) return;

    const delegateName = lowerFirst(params.model);
    const delegate = (this.replica as unknown as Record<string, unknown>)[
      delegateName
    ] as Record<string, (args: unknown) => Promise<unknown>> | undefined;

    if (!delegate || typeof delegate[params.action] !== 'function') {
      this.logger.warn(
        `No replica delegate for ${params.model}.${params.action}`,
      );
      return;
    }

    await delegate[params.action](params.args);
  }

  private enqueueReplication(params: Prisma.MiddlewareParams): void {
    const snapshot = {
      ...params,
      args: structuredClone(params.args ?? {}),
    } as Prisma.MiddlewareParams;

    this.replicationQueue = this.replicationQueue
      .then(() => this.replicateWithRetry(snapshot))
      .catch((err) => {
        this.logger.warn(
          `Replication failed for ${snapshot.model}.${snapshot.action}: ${
            (err as Error).message
          }`,
        );
      });
  }

  private async replicateWithRetry(
    params: Prisma.MiddlewareParams,
  ): Promise<void> {
    const maxAttempts = 4;
    const retryDelayMs = [100, 250, 500];

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.replicateToReplica(params);
        return;
      } catch (err) {
        const retryable = isRetryableReplicaError(err);
        if (!retryable || attempt === maxAttempts) {
          throw err;
        }
        await sleep(retryDelayMs[Math.min(attempt - 1, retryDelayMs.length - 1)]);
      }
    }
  }
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function isRetryableReplicaError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === 'P2003' || message.includes('Foreign key constraint violated');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
