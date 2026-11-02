import { defineConfig } from 'vitest/config';

// The tests use the same database settings as npm start, from .env.
process.loadEnvFile('.env');

export default defineConfig({
  test: {
    // The test files share one database, so they run one at a time.
    fileParallelism: false,
  },
});
