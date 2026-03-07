import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'], // Entry-point bootstrapping — not unit-testable
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});
