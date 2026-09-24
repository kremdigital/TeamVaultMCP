import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

// The stdio entry point as an agent runs it: a child process speaking JSON-RPC
// over stdin/stdout (the TASK-0010 smoke: `initialize` + `tools/list`). Listing
// tools makes no HTTP calls, and the URL points at a closed local port anyway.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENTRY = ['--import', 'tsx', 'src/index.ts'];
const REQUIRED = { TEAM_VAULT_URL: 'http://127.0.0.1:9', TEAM_VAULT_API_KEY: 'osync_test_key' };

async function toolsOfProcess(env: Record<string, string>): Promise<string[]> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ENTRY,
    cwd: ROOT,
    // Merged over the SDK's safe default environment, which does not pass
    // TEAM_VAULT_* through: the developer's own settings cannot leak in.
    env: { ...REQUIRED, ...env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'team-vault-mcp-tests', version: '0.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => t.name).sort();
  } finally {
    await client.close();
  }
}

describe('stdio entry point (src/index.ts)', { timeout: 30_000 }, () => {
  it('registers the write tools without TEAM_VAULT_READ_ONLY', async () => {
    const tools = await toolsOfProcess({});

    expect(tools).toContain('write_note');
    expect(tools).toContain('move_note');
    expect(tools).toContain('delete_note');
  });

  it('TEAM_VAULT_READ_ONLY=1 leaves the write tools out', async () => {
    const tools = await toolsOfProcess({ TEAM_VAULT_READ_ONLY: '1' });

    expect(tools).toEqual([
      'list_note_versions',
      'list_notes',
      'list_projects',
      'read_note',
      'whoami',
    ]);
  });

  it('exits with code 1 and a hint on stderr without TEAM_VAULT_URL/TEAM_VAULT_API_KEY', () => {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('TEAM_VAULT_')) delete env[key];

    const run = spawnSync(process.execPath, ENTRY, { cwd: ROOT, env, encoding: 'utf8' });

    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('set TEAM_VAULT_URL and TEAM_VAULT_API_KEY');
  });
});
