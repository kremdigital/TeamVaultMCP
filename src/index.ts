import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TeamVaultClient } from './client.js';
import { readConfig, USAGE } from './config.js';
import { createServer } from './server.js';

const config = readConfig(process.env);

if (!config) {
  // stderr only — stdout is the JSON-RPC channel.
  console.error(USAGE);
  process.exit(1);
}

const { baseUrl, apiKey, defaultProjectId, readOnly } = config;
const client = new TeamVaultClient({ baseUrl, apiKey });
const server = createServer(client, { defaultProjectId, readOnly });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `TeamVaultMCP connected to ${baseUrl}${readOnly ? ' (read-only)' : ''}${
    defaultProjectId ? ` · default project ${defaultProjectId}` : ''
  }.`,
);
