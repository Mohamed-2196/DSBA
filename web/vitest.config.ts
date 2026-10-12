// Unit tests for pure helpers: `npm test` (vitest run). Put `<name>.test.ts` next to the code it checks and import
// describe/it/expect from 'vitest'. They run in Node: keep DOM-free logic in plain modules and test that.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
