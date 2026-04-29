export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  corsOrigin: string;
  database: DatabaseConfig;
}

export interface DatabaseConfig {
  url: string;
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
    logging: process.env.DATABASE_LOGGING === 'true',
  },
});
