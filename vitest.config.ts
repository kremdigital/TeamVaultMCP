import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Every test starts with a `fetch` guard: nothing reaches the network, and
    // a call the test did not mock (tests/helpers/fetch.ts) fails the test
    // afterwards even if the client swallowed the error (tests/setup.ts).
    setupFiles: ['./tests/setup.ts'],
    unstubGlobals: true,
    unstubEnvs: true,
    restoreMocks: true,
  },
});
