export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  corsOrigin: string;
  database: DatabaseConfig;
}

export interface DatabaseConfig {
  url: string;
  /**
   * Optional secondary database (e.g. managed Postgres replica) used as a live
   * mirror. When set, every successful write on the primary is replicated
   * asynchronously by `PrismaService`.
   */
  replicaUrl: string | null;
  logging: boolean;
}

export const configuration = (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  database: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://applyhub:applyhub_dev@localhost:5432/applyhub?schema=public',
    replicaUrl: process.env.DATABASE_URL_REPLICA?.trim()
      ? process.env.DATABASE_URL_REPLICA.trim()
      : null,
    logging: process.env.DATABASE_LOGGING === 'true',
  },
});
