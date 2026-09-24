import { describe, expect, it } from 'vitest';
import { TeamVaultClient } from '../../src/client.js';
import { json, mockFetch } from '../helpers/fetch.js';
import { connect } from '../helpers/mcp.js';

// Not part of the main run (vitest.config.ts collects tests/**/*.test.ts only).
// tests/network-guard.test.ts runs this file in a child vitest process and
// expects the first two tests to FAIL: each one forgets to mock fetch and only
// checks that an error came back, which the client produces by itself when the
// guard refuses the call.

describe('network guard fixture', () => {
  it('swallowed by the client', async () => {
    const client = new TeamVaultClient({ baseUrl: 'https://vault.test', apiKey: 'k' });

    await expect(client.whoami()).rejects.toThrow();
  });

  it('swallowed by a tool', async () => {
    const mcp = await connect({ readOnly: false, defaultProjectId: 'p1' });
    try {
      const res = await mcp.call('read_note', { path: 'a.md' });

      expect(res.isError).toBe(true);
    } finally {
      await mcp.close();
    }
  });

  it('mocked', async () => {
    mockFetch(() => json({ projects: [] }));
    const client = new TeamVaultClient({ baseUrl: 'https://vault.test', apiKey: 'k' });

    await expect(client.listProjects()).resolves.toEqual([]);
  });
});
