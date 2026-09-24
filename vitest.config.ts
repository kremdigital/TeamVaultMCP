import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Every test starts with a `fetch` that fails loudly: nothing reaches the
    // network unless a test installs its own mock (tests/helpers/fetch.ts).
    setupFiles: ['./tests/setup.ts'],
    unstubGlobals: true,
    unstubEnvs: true,
    restoreMocks: true,
  },
});
