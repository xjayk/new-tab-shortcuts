import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/*.test.js', 'tests/*.spec.js'],
    exclude: ['tests/integration/**', 'node_modules/**'],
  },
});
