import { defineConfig } from 'vitest/config';
import base from '../../vitest.config.js';

// The project's own test configuration (setup file, stubs, mocks) pointed at
// the fixtures, which the main run never collects. Used by
// tests/network-guard.test.ts to run a fixture in a child vitest process.
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['tests/fixtures/*.fixture.ts'] },
});
