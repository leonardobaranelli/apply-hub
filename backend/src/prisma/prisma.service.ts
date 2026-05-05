import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import {
  ReplicaLikeClient,
  ReplicationMiddleware,
} from './replication.middleware';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly replicaUrl: string | null;
  private replica: PrismaClient | null = null;
  private replication: ReplicationMiddleware | null = null;

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
    if (this.replication) {
      await this.replication.drain();
    }
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
      this.replication = new ReplicationMiddleware(
        replica as unknown as ReplicaLikeClient,
        this.logger,
      );
      this.$use(this.replication.middleware);
      this.logger.log('Prisma connected (replica)');
    } catch (err) {
      this.logger.warn(
        `Replica unavailable, replication disabled: ${(err as Error).message}`,
      );
      await replica.$disconnect().catch(() => undefined);
      this.replica = null;
      this.replication = null;
    }
  }
}
