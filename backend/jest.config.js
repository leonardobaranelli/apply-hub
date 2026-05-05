/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'ts', 'json'],
  testRegex: '\\.(spec|test)\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transformIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          target: 'ES2022',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          strictNullChecks: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
        },
      },
    ],
  },
  // .mjs files are loaded via dynamic import() inside specs that need them.
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/**/dto/**',
    '!src/**/index.ts',
    '!src/main.ts',
  ],
  coverageDirectory: 'coverage',
  clearMocks: true,
  restoreMocks: true,
};
