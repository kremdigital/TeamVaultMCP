import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TeamVaultClient } from './client.js';

export interface ServerOptions {
  /** Project used by tools called without `projectId`. */
  defaultProjectId?: string | undefined;
  /** Read-only mode: the write tools are not registered at all. */
  readOnly: boolean;
}

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Builds the MCP server with the Team Vault tools registered. The transport is
 * the caller's business: `index.ts` connects stdio, tests an in-memory pair.
 */
export function createServer(client: TeamVaultClient, options: ServerOptions): McpServer {
  const { defaultProjectId, readOnly } = options;

  function resolveProject(projectId: string | undefined): string {
    const id = projectId ?? defaultProjectId;
    if (!id) {
      throw new Error(
        'No projectId given and TEAM_VAULT_PROJECT_ID is not set — call list_projects to find one.',
      );
    }
    return id;
  }

  async function findByPath(projectId: string, path: string) {
    const files = await client.listFiles(projectId, { path });
    return files.find((f) => f.path === path) ?? null;
  }

  const server = new McpServer({ name: 'team-vault', version: '0.1.0' });

  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description: 'Return the user the configured API key belongs to (id, email, name).',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await client.whoami());
      } catch (err) {
        return fail(errMsg(err));
      }
    },
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description: 'List the Team Vault projects the API key can access (id, slug, name).',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await client.listProjects());
      } catch (err) {
        return fail(errMsg(err));
      }
    },
  );

  server.registerTool(
    'list_notes',
    {
      title: 'List notes',
      description:
        'List file paths in a project. `prefix` filters by path prefix (e.g. a folder like "персонажи/").',
      inputSchema: {
        projectId: z.string().optional().describe('Defaults to TEAM_VAULT_PROJECT_ID if set.'),
        prefix: z.string().optional().describe('Only return paths starting with this prefix.'),
      },
    },
    async ({ projectId, prefix }) => {
      try {
        const id = resolveProject(projectId);
        const files = await client.listFiles(id, prefix ? { prefix } : undefined);
        return ok(files.map((f) => ({ path: f.path, type: f.fileType, size: f.size })));
      } catch (err) {
        return fail(errMsg(err));
      }
    },
  );

  server.registerTool(
    'read_note',
    {
      title: 'Read note',
      description:
        "Read a text file's content by its vault path. Binary files are not returned (use the web/REST download).",
      inputSchema: {
        path: z.string().describe('Vault-relative path, e.g. "персонажи/кузьма-минин.md".'),
        projectId: z.string().optional(),
      },
    },
    async ({ path, projectId }) => {
      try {
        const id = resolveProject(projectId);
        const file = await findByPath(id, path);
        if (!file) return fail(`Note not found: ${path}`);
        if (file.fileType !== 'TEXT') {
          return fail(`Not a text file: ${path} (${file.mimeType ?? file.fileType}).`);
        }
        return ok(await client.readFile(id, file.id));
      } catch (err) {
        return fail(errMsg(err));
      }
    },
  );

  server.registerTool(
    'list_note_versions',
    {
      title: 'List note versions',
      description: 'List the saved version history of a file by path (newest first).',
      inputSchema: { path: z.string(), projectId: z.string().optional() },
    },
    async ({ path, projectId }) => {
      try {
        const id = resolveProject(projectId);
        const file = await findByPath(id, path);
        if (!file) return fail(`Note not found: ${path}`);
        return ok(await client.listVersions(id, file.id));
      } catch (err) {
        return fail(errMsg(err));
      }
    },
  );

  // --- write tools (omitted entirely in read-only mode) ---------------------

  if (!readOnly) {
    server.registerTool(
      'write_note',
      {
        title: 'Write note',
        description:
          'Create a new text note, or overwrite an existing one, at the given vault path. Returns whether it was created or updated.',
        inputSchema: {
          path: z.string().describe('Vault-relative path, e.g. "события/новая-заметка.md".'),
          content: z.string().describe('Full UTF-8 text content of the note.'),
          projectId: z.string().optional(),
        },
      },
      async ({ path, content, projectId }) => {
        try {
          const id = resolveProject(projectId);
          const existing = await findByPath(id, path);
          const file = existing
            ? await client.updateFile(id, existing.id, content)
            : await client.createFile(id, path, content);
          return ok({
            path: file.path,
            action: existing ? 'updated' : 'created',
            size: file.size,
          });
        } catch (err) {
          return fail(errMsg(err));
        }
      },
    );

    server.registerTool(
      'move_note',
      {
        title: 'Move / rename note',
        description: 'Move or rename a file within the project.',
        inputSchema: {
          path: z.string().describe('Current vault path.'),
          newPath: z.string().describe('Destination vault path.'),
          projectId: z.string().optional(),
        },
      },
      async ({ path, newPath, projectId }) => {
        try {
          const id = resolveProject(projectId);
          const file = await findByPath(id, path);
          if (!file) return fail(`Note not found: ${path}`);
          return ok(await client.moveFile(id, file.id, newPath));
        } catch (err) {
          return fail(errMsg(err));
        }
      },
    );

    server.registerTool(
      'delete_note',
      {
        title: 'Delete note',
        description: 'Soft-delete a file by path (recoverable on the server as a tombstone).',
        inputSchema: { path: z.string(), projectId: z.string().optional() },
      },
      async ({ path, projectId }) => {
        try {
          const id = resolveProject(projectId);
          const file = await findByPath(id, path);
          if (!file) return fail(`Note not found: ${path}`);
          await client.deleteFile(id, file.id);
          return ok({ path, action: 'deleted' });
        } catch (err) {
          return fail(errMsg(err));
        }
      },
    );
  }

  return server;
}
