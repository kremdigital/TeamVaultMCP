import { afterEach, describe, expect, it } from 'vitest';
import { apiError, describeCall, json, mockFetch, rawFile } from './helpers/fetch.js';
import { connect, type Harness } from './helpers/mcp.js';

const READ_TOOLS = ['list_note_versions', 'list_notes', 'list_projects', 'read_note', 'whoami'];
const WRITE_TOOLS = ['delete_note', 'move_note', 'write_note'];

let harness: Harness | undefined;

async function open(options: Parameters<typeof connect>[0]): Promise<Harness> {
  harness = await connect(options);
  return harness;
}

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('tool registration', () => {
  it('registers read and write tools by default', async () => {
    const mcp = await open({ readOnly: false });

    expect(await mcp.listToolNames()).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
  });

  it('read-only mode does not register the write tools at all', async () => {
    const mcp = await open({ readOnly: true });

    const names = await mcp.listToolNames();
    expect(names).toEqual(READ_TOOLS);
    for (const tool of WRITE_TOOLS) expect(names).not.toContain(tool);
  });

  it('read-only mode rejects a write call without touching the server', async () => {
    const calls = mockFetch(() => json({ files: [] }));
    const mcp = await open({ readOnly: true, defaultProjectId: 'p1' });

    const res = await mcp.call('write_note', { path: 'a.md', content: 'x' });

    expect(res.isError).toBe(true);
    expect(res.text).toContain('Tool write_note not found');
    expect(calls).toEqual([]);
  });
});

describe('write_note', () => {
  it('creates the note when the path does not exist', async () => {
    const path = 'события/новая заметка.md';
    const calls = mockFetch((req) => {
      if (req.method === 'GET') return json({ files: [] });
      if (req.method === 'POST') return json({ file: rawFile('f-new', path, { size: '11' }) }, 201);
      return apiError(500, 'unexpected', describeCall(req));
    });
    const mcp = await open({ readOnly: false, defaultProjectId: 'p1' });

    const res = await mcp.call('write_note', { path, content: 'новый текст' });

    expect(res.isError).toBe(false);
    expect(JSON.parse(res.text)).toEqual({ path, action: 'created', size: 11 });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST']);
    expect(calls[0]?.url.pathname).toBe('/api/projects/p1/files');
    expect(calls[0]?.url.searchParams.get('path')).toBe(path);
    const form = calls[1]?.body as FormData;
    expect(form.get('path')).toBe(path);
    await expect((form.get('file') as File).text()).resolves.toBe('новый текст');
  });

  it('updates the note in place when the path exists', async () => {
    const path = 'персонажи/кузьма-минин.md';
    const calls = mockFetch((req) => {
      if (req.method === 'GET') return json({ files: [rawFile('f7', path)] });
      if (req.method === 'PUT') return json({ file: rawFile('f7', path, { size: '4' }) });
      return apiError(500, 'unexpected', describeCall(req));
    });
    const mcp = await open({ readOnly: false, defaultProjectId: 'p1' });

    const res = await mcp.call('write_note', { path, content: 'тест' });

    expect(res.isError).toBe(false);
    expect(JSON.parse(res.text)).toEqual({ path, action: 'updated', size: 4 });
    expect(calls.map(describeCall)).toEqual([
      `GET /api/projects/p1/files?${new URLSearchParams({ path }).toString()}`,
      'PUT /api/projects/p1/files/f7',
    ]);
    expect(calls[1]?.body).toBe('тест');
  });

  it('matches the exact path even if the server ignores ?path= and returns the whole project', async () => {
    const calls = mockFetch((req) => {
      if (req.method === 'GET') {
        return json({
          files: [rawFile('f1', 'a.md.bak'), rawFile('f2', 'dir/a.md'), rawFile('f3', 'a.md')],
        });
      }
      return json({ file: rawFile('f3', 'a.md') });
    });
    const mcp = await open({ readOnly: false, defaultProjectId: 'p1' });

    const res = await mcp.call('write_note', { path: 'a.md', content: 'x' });

    expect(JSON.parse(res.text)).toMatchObject({ action: 'updated' });
    expect(calls[1] && describeCall(calls[1])).toBe('PUT /api/projects/p1/files/f3');
  });

  it('reports 409 path_exists from a racing create as a tool error, without retrying', async () => {
    const calls = mockFetch((req) =>
      req.method === 'GET'
        ? json({ files: [] })
        : apiError(409, 'path_exists', 'Файл с таким путём уже существует'),
    );
    const mcp = await open({ readOnly: false, defaultProjectId: 'p1' });

    const res = await mcp.call('write_note', { path: 'a.md', content: 'x' });

    expect(res.isError).toBe(true);
    expect(res.text).toContain('HTTP 409');
    expect(res.text).toContain('path_exists');
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST']);
  });

  it('an explicit projectId wins over the default project', async () => {
    const calls = mockFetch((req) =>
      req.method === 'GET' ? json({ files: [] }) : json({ file: rawFile('f1', 'a.md') }, 201),
    );
    const mcp = await open({ readOnly: false, defaultProjectId: 'p-default' });

    await mcp.call('write_note', { path: 'a.md', content: 'x', projectId: 'p-other' });

    expect(calls.map((c) => c.url.pathname)).toEqual([
      '/api/projects/p-other/files',
      '/api/projects/p-other/files',
    ]);
  });

  it('without a projectId and a default project it fails before any request', async () => {
    const calls = mockFetch(() => json({ files: [] }));
    const mcp = await open({ readOnly: false });

    const res = await mcp.call('write_note', { path: 'a.md', content: 'x' });

    expect(res.isError).toBe(true);
    expect(res.text).toContain('TEAM_VAULT_PROJECT_ID is not set');
    expect(calls).toEqual([]);
  });
});

describe('read tools', () => {
  it('read_note returns the content of a text note', async () => {
    const calls = mockFetch((req) =>
      req.url.pathname.endsWith('/files')
        ? json({ files: [rawFile('f1', 'a.md')] })
        : new Response('# Заголовок\n'),
    );
    const mcp = await open({ readOnly: true, defaultProjectId: 'p1' });

    const res = await mcp.call('read_note', { path: 'a.md' });

    expect(res).toEqual({ isError: false, text: '# Заголовок\n' });
    expect(calls[1] && describeCall(calls[1])).toBe('GET /api/projects/p1/files/f1');
  });

  it('read_note on a missing path (200 with an empty list) → Note not found', async () => {
    const calls = mockFetch(() => json({ files: [] }));
    const mcp = await open({ readOnly: true, defaultProjectId: 'p1' });

    const res = await mcp.call('read_note', { path: 'нет.md' });

    expect(res).toEqual({ isError: true, text: 'Note not found: нет.md' });
    expect(calls).toHaveLength(1);
  });

  it('read_note refuses binary files', async () => {
    mockFetch(() =>
      json({ files: [rawFile('f1', 'img.png', { fileType: 'BINARY', mimeType: 'image/png' })] }),
    );
    const mcp = await open({ readOnly: true, defaultProjectId: 'p1' });

    const res = await mcp.call('read_note', { path: 'img.png' });

    expect(res).toEqual({ isError: true, text: 'Not a text file: img.png (image/png).' });
  });

  it('a 5xx from the server becomes a tool error with the status', async () => {
    mockFetch(() => new Response('Bad Gateway', { status: 502 }));
    const mcp = await open({ readOnly: true, defaultProjectId: 'p1' });

    const res = await mcp.call('read_note', { path: 'a.md' });

    expect(res.isError).toBe(true);
    expect(res.text).toContain('HTTP 502: Bad Gateway');
  });

  it('a 404 for an unknown project becomes a tool error', async () => {
    mockFetch(() => apiError(404, 'not_found', 'Проект не найден'));
    const mcp = await open({ readOnly: true });

    const res = await mcp.call('list_notes', { projectId: 'gone' });

    expect(res.isError).toBe(true);
    expect(res.text).toContain('HTTP 404');
    expect(res.text).toContain('Проект не найден');
  });

  it('list_notes passes the prefix and returns path, type and size', async () => {
    const calls = mockFetch(() =>
      json({ files: [rawFile('f1', 'персонажи/a.md', { size: '42' })] }),
    );
    const mcp = await open({ readOnly: true, defaultProjectId: 'p1' });

    const res = await mcp.call('list_notes', { prefix: 'персонажи/' });

    expect(JSON.parse(res.text)).toEqual([{ path: 'персонажи/a.md', type: 'TEXT', size: 42 }]);
    expect(calls[0]?.url.searchParams.get('prefix')).toBe('персонажи/');
  });

  it('list_note_versions resolves the path and lists versions', async () => {
    const versions = [
      { id: 'v1', versionNumber: 1, contentHash: 'h', message: null, createdAt: 't' },
    ];
    const calls = mockFetch((req) =>
      req.url.pathname.endsWith('/versions')
        ? json({ versions })
        : json({ files: [rawFile('f1', 'a.md')] }),
    );
    const mcp = await open({ readOnly: true, defaultProjectId: 'p1' });

    const res = await mcp.call('list_note_versions', { path: 'a.md' });

    expect(JSON.parse(res.text)).toEqual(versions);
    expect(calls[1] && describeCall(calls[1])).toBe('GET /api/projects/p1/files/f1/versions');
  });
});

describe('move_note and delete_note', () => {
  it('move_note surfaces 409 path_exists from the server', async () => {
    mockFetch((req) =>
      req.method === 'GET'
        ? json({ files: [rawFile('f1', 'a.md')] })
        : apiError(409, 'path_exists', 'Файл с таким путём уже существует'),
    );
    const mcp = await open({ readOnly: false, defaultProjectId: 'p1' });

    const res = await mcp.call('move_note', { path: 'a.md', newPath: 'b.md' });

    expect(res.isError).toBe(true);
    expect(res.text).toContain('HTTP 409');
    expect(res.text).toContain('path_exists');
  });

  it('move_note on a missing path → Note not found, no PATCH', async () => {
    const calls = mockFetch(() => json({ files: [] }));
    const mcp = await open({ readOnly: false, defaultProjectId: 'p1' });

    const res = await mcp.call('move_note', { path: 'a.md', newPath: 'b.md' });

    expect(res).toEqual({ isError: true, text: 'Note not found: a.md' });
    expect(calls.map((c) => c.method)).toEqual(['GET']);
  });

  it('delete_note resolves the path and deletes by fileId', async () => {
    const calls = mockFetch((req) =>
      req.method === 'GET' ? json({ files: [rawFile('f1', 'a.md')] }) : json({ success: true }),
    );
    const mcp = await open({ readOnly: false, defaultProjectId: 'p1' });

    const res = await mcp.call('delete_note', { path: 'a.md' });

    expect(JSON.parse(res.text)).toEqual({ path: 'a.md', action: 'deleted' });
    expect(calls[1] && describeCall(calls[1])).toBe('DELETE /api/projects/p1/files/f1');
  });
});
