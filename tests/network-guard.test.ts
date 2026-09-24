import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TeamVaultClient, TeamVaultError } from '../src/client.js';
import { json, mockFetch } from './helpers/fetch.js';
import { assertNoNetworkCalls } from './helpers/network-guard.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VITEST = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

function makeClient() {
  return new TeamVaultClient({ baseUrl: 'https://vault.test', apiKey: 'osync_test_key' });
}

interface JsonReport {
  testResults: Array<{
    assertionResults: Array<{ title: string; status: string; failureMessages: string[] }>;
  }>;
}

/** Runs tests/fixtures/*.fixture.ts under the project's test setup in a child vitest. */
function runFixtures(): {
  status: number | null;
  results: Map<string, { status: string; failure: string }>;
} {
  const env = { ...process.env };
  // The child is a fresh vitest run, not a worker of this one, and it must not
  // see the developer's own Team Vault settings.
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITEST') || key.startsWith('TEAM_VAULT_')) delete env[key];
  }
  // `--no-cache`: the child leaves the results cache of the main run alone.
  const args = ['run', '--config', 'tests/fixtures/vitest.fixtures.config.ts'];
  const run = spawnSync(process.execPath, [VITEST, ...args, '--reporter=json', '--no-cache'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
  const start = run.stdout.indexOf('{');
  if (start < 0) throw new Error(`no JSON report from the child vitest:\n${run.stderr}`);
  const report = JSON.parse(run.stdout.slice(start)) as JsonReport;
  const results = new Map(
    report.testResults
      .flatMap((file) => file.assertionResults)
      .map((a) => [a.title, { status: a.status, failure: a.failureMessages.join('\n') }]),
  );
  return { status: run.status, results };
}

describe('network guard (tests/setup.ts)', () => {
  it('records a call the client swallows and reports it once', async () => {
    const err = await makeClient()
      .whoami()
      .catch((e: unknown) => e);

    // The client turns the guard's refusal into an ordinary error...
    expect(err).toBeInstanceOf(TeamVaultError);
    expect((err as TeamVaultError).status).toBe(0);
    // ...so the guard keeps its own record of the call.
    expect(() => assertNoNetworkCalls()).toThrow('GET https://vault.test/api/auth/me');
    expect(() => assertNoNetworkCalls()).not.toThrow();
  });

  it('stays quiet when the test mocks fetch', async () => {
    mockFetch(() => json({ projects: [] }));

    await makeClient().listProjects();

    expect(() => assertNoNetworkCalls()).not.toThrow();
  });
});

describe('network guard in a real run (tests/fixtures)', { timeout: 60_000 }, () => {
  it('fails a test that forgot to mock fetch even if it only expects an error', () => {
    const { status, results } = runFixtures();

    expect(results.get('swallowed by the client')).toEqual({
      status: 'failed',
      failure: expect.stringContaining(
        'Unexpected network call in tests (mock it with mockFetch): GET https://vault.test/api/auth/me',
      ),
    });
    expect(results.get('swallowed by a tool')).toEqual({
      status: 'failed',
      failure: expect.stringContaining(
        'Unexpected network call in tests (mock it with mockFetch): GET https://vault.test/api/projects/p1/files?path=a.md',
      ),
    });
    expect(results.get('mocked')).toEqual({ status: 'passed', failure: '' });
    expect(results.size).toBe(3);
    expect(status).toBe(1);
  });
});
