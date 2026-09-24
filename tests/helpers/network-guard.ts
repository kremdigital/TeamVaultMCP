import { vi } from 'vitest';

/** Calls that reached the guard since the last check, as `METHOD url`. */
const unexpected: string[] = [];

/**
 * Replaces the global `fetch` with a guard that refuses every call. A test
 * that expects HTTP installs its own mock with `mockFetch`
 * (tests/helpers/fetch.ts), which replaces the guard for that test.
 *
 * Throwing is not enough on its own: `TeamVaultClient.request` catches
 * whatever `fetch` throws and turns it into a `TeamVaultError` with status 0,
 * and a tool turns that into an ordinary `isError: true` result. A test that
 * only expects an error would pass while the code went for the network. So the
 * guard also records the call, and `assertNoNetworkCalls` fails the test after
 * it has run (tests/setup.ts).
 */
export function installNetworkGuard(): void {
  unexpected.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown, init?: RequestInit) => {
      const call = `${init?.method ?? 'GET'} ${String(input)}`;
      unexpected.push(call);
      throw new Error(`Unexpected network call in tests: ${call}`);
    }),
  );
}

/**
 * Throws if any call reached the guard since it was installed or last checked,
 * and forgets those calls, so each one is reported once.
 */
export function assertNoNetworkCalls(): void {
  if (unexpected.length === 0) return;
  const calls = unexpected.splice(0);
  throw new Error(`Unexpected network call in tests (mock it with mockFetch): ${calls.join('; ')}`);
}
