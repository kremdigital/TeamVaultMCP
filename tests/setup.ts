import { beforeEach, vi } from 'vitest';

// Tests never touch the network. A test that expects HTTP installs its own
// mock with `mockFetch` (tests/helpers/fetch.ts); any other call fails loudly
// instead of reaching a real server. `unstubGlobals` restores the real `fetch`
// after each test, so the stub has to be installed again every time.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      throw new Error(`Unexpected network call in tests: ${String(input)}`);
    }),
  );
});
