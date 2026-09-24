import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TeamVaultClient } from '../../src/client.js';
import { createServer, type ServerOptions } from '../../src/server.js';

export const BASE_URL = 'https://vault.test';
export const API_KEY = 'osync_test_key';

export interface ToolCall {
  isError: boolean;
  text: string;
}

export interface Harness {
  listToolNames(): Promise<string[]>;
  call(name: string, args?: Record<string, unknown>): Promise<ToolCall>;
  close(): Promise<void>;
}

/**
 * The real MCP server (`createServer`) behind an in-memory transport, driven by
 * a real MCP client: tool calls go through the SDK's argument validation and
 * the real `TeamVaultClient`. Only `fetch` is mocked, by the test.
 */
export async function connect(options: ServerOptions): Promise<Harness> {
  const vault = new TeamVaultClient({ baseUrl: BASE_URL, apiKey: API_KEY });
  const server = createServer(vault, options);
  const client = new Client({ name: 'team-vault-mcp-tests', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    async listToolNames() {
      const { tools } = await client.listTools();
      return tools.map((t) => t.name).sort();
    },
    async call(name, args = {}) {
      const result = await client.callTool({ name, arguments: args });
      const content = result.content as Array<{ type: string; text?: string }>;
      return {
        isError: result.isError === true,
        text: content.map((c) => c.text ?? '').join(''),
      };
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}
