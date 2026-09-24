import { afterEach, beforeEach } from 'vitest';
import { assertNoNetworkCalls, installNetworkGuard } from './helpers/network-guard.js';

// Tests never touch the network. Every test starts with a `fetch` guard that
// refuses and records each call; a test that expects HTTP installs its own mock
// with `mockFetch` (tests/helpers/fetch.ts). The client swallows the guard's
// error into a TeamVaultError, so the check after the test is what fails it.
// `unstubGlobals` restores the real `fetch` between tests, so the guard has to
// be installed again every time.
beforeEach(() => {
  installNetworkGuard();
});

afterEach(() => {
  assertNoNetworkCalls();
});
