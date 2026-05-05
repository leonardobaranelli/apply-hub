import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * Prisma actions that mutate state and therefore need to be replicated to the
 * secondary database. Read-only operations are intentionally excluded.
 */
export const MUTATING_ACTIONS: ReadonlySet<Prisma.PrismaAction> = new Set<
  Prisma.PrismaAction
>([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

/**
 * Prisma model delegate names (lower-camelCase form of the model name).
 * Kept here so both this module and the replication tests share a single
 * source of truth in case the schema grows.
 */
export const REPLICATED_MODELS: readonly string[] = [
  'contact',
  'jobSearchSession',
  'jobApplication',
  'applicationEvent',
  'template',
  'platformSettings',
];

/** Anything with a per-action async function shaped like `delegate.create(args)`. */
export type ReplicaLikeClient = {
  [delegate: string]:
    | { [action: string]: (args: unknown) => Promise<unknown> }
    | unknown;
};

export interface ReplicationLogger {
  warn(message: string): void;
}

export interface ReplicationOptions {
  /** Sleep durations between retry attempts (ms). Length determines max retries. */
  retryDelaysMs?: readonly number[];
  /** Sleep implementation; injectable so tests can run instantly. */
  sleep?: (ms: number) => Promise<void>;
  /** UUID generator; injectable so tests can assert deterministic IDs. */
  generateId?: () => string;
  /** Snapshot helper; injectable so tests can verify isolation from in-flight mutations. */
  cloneArgs?: <T>(value: T) => T;
}

/**
 * Implements the write-mirror logic that runs as Prisma middleware.
 *
 * Responsibilities:
 *  1. Pre-generate UUIDs on `create` / `createMany` so primary and replica
 *     end up with the same primary key.
 *  2. After a successful primary write, enqueue an identical operation
 *     against the replica.
 *  3. Serialize replica writes to preserve order and avoid FK races.
 *  4. Retry transient `P2003` (FK violated) errors a few times — typical
 *     when a child replicates before its parent.
 *  5. Never throw out of the queue; replica failures are logged but do not
 *     break primary requests. Reconciliation runs out-of-band via the
 *     `db:status` and `db:sync*` scripts.
 */
export class ReplicationMiddleware {
  private queue: Promise<void> = Promise.resolve();

  private readonly retryDelaysMs: readonly number[];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly generateId: () => string;
  private readonly cloneArgs: <T>(value: T) => T;

  constructor(
    private readonly replica: ReplicaLikeClient,
    private readonly logger: ReplicationLogger,
    options: ReplicationOptions = {},
  ) {
    this.retryDelaysMs = options.retryDelaysMs ?? [100, 250, 500];
    this.sleep =
      options.sleep ??
      ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    this.generateId = options.generateId ?? randomUUID;
    this.cloneArgs =
      options.cloneArgs ??
      (typeof structuredClone === 'function'
        ? structuredClone
        : <T>(v: T) => JSON.parse(JSON.stringify(v ?? null)) as T);
  }

  /**
   * Bind to a `prisma.$use(...)` invocation. Mutates `params.args` in place
   * for `create` / `createMany` to inject deterministic UUIDs that both the
   * primary and the replica will see.
   */
  middleware = async (
    params: Prisma.MiddlewareParams,
    next: (p: Prisma.MiddlewareParams) => Promise<unknown>,
  ): Promise<unknown> => {
    this.preGenerateIds(params);

    const result = await next(params);

    if (this.shouldReplicate(params)) {
      this.enqueue(params);
    }

    return result;
  };

  /** Pure helper exposed for tests + reuse outside the middleware closure. */
  shouldReplicate(params: Prisma.MiddlewareParams): boolean {
    return Boolean(params.model) && MUTATING_ACTIONS.has(params.action);
  }

  preGenerateIds(params: Prisma.MiddlewareParams): void {
    if (params.action === 'create') {
      const data = params.args?.data;
      if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        !(data as { id?: unknown }).id
      ) {
        (data as { id: string }).id = this.generateId();
      }
    } else if (params.action === 'createMany') {
      const data = params.args?.data;
      if (Array.isArray(data)) {
        for (const row of data) {
          if (
            row &&
            typeof row === 'object' &&
            !(row as { id?: unknown }).id
          ) {
            (row as { id: string }).id = this.generateId();
          }
        }
      }
    }
  }

  enqueue(params: Prisma.MiddlewareParams): void {
    const snapshot: Prisma.MiddlewareParams = {
      ...params,
      args: this.cloneArgs(params.args ?? {}),
    };

    this.queue = this.queue
      .then(() => this.replicateWithRetry(snapshot))
      .catch((err) => {
        this.logger.warn(
          `Replication failed for ${snapshot.model}.${snapshot.action}: ${
            (err as Error).message
          }`,
        );
      });
  }

  /**
   * Wait until every queued replica write has either succeeded or its retries
   * have been exhausted. Used by `onModuleDestroy` and by tests that need to
   * assert side effects after the queue drains.
   */
  drain(): Promise<void> {
    return this.queue.catch(() => undefined);
  }

  private async replicateWithRetry(
    params: Prisma.MiddlewareParams,
  ): Promise<void> {
    const maxAttempts = this.retryDelaysMs.length + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.replicate(params);
        return;
      } catch (err) {
        const retryable = isRetryableReplicaError(err);
        if (!retryable || attempt === maxAttempts) {
          throw err;
        }
        await this.sleep(this.retryDelaysMs[attempt - 1]);
      }
    }
  }

  private async replicate(params: Prisma.MiddlewareParams): Promise<void> {
    if (!params.model) return;
    const delegateName = lowerFirst(params.model);
    const delegate = this.replica[delegateName] as
      | { [action: string]: (args: unknown) => Promise<unknown> }
      | undefined;

    if (!delegate || typeof delegate[params.action] !== 'function') {
      this.logger.warn(
        `No replica delegate for ${params.model}.${params.action}`,
      );
      return;
    }

    await delegate[params.action](params.args);
  }
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export function isRetryableReplicaError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === 'P2003' || message.includes('Foreign key constraint violated');
}
