import { defineConfig } from 'vitest/config';

const hasSystemBinary = Boolean(process.env.MONGOMS_SYSTEM_BINARY);

export default defineConfig({
  test: {
    hookTimeout: 300000,
    testTimeout: 60000,
    fileParallelism: !hasSystemBinary,
  },
});
