import { describe, expect, it } from 'vitest';
import { TeamVaultClient, TeamVaultError } from '../src/client.js';
import { apiError, describeCall, json, mockFetch, rawFile } from './helpers/fetch.js';

const API_KEY = 'osync_test_key';

function makeClient(baseUrl = 'https://vault.test') {
  return new TeamVaultClient({ baseUrl, apiKey: API_KEY });
}

/** Resolves to the error the promise rejects with, failing if it resolves. */
async function rejection(promise: Promise<unknown>): Promise<TeamVaultError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(TeamVaultError);
    return err as TeamVaultError;
  }
  throw new Error('expected the call to reject');
}

describe('TeamVaultClient: authentication', () => {
  it('sends X-API-Key on every request and no other credentials', async () => {
    const calls = mockFetch((req) => {
      if (req.method === 'GET' && req.url.pathname === '/api/auth/me') {
        return json({ user: { id: 'u1', email: 'a@b.c', name: null } });
      }
      if (req.url.pathname === '/api/projects') return json({ projects: [] });
      if (req.url.pathname.endsWith('/versions')) return json({ versions: [] });
      if (req.method === 'GET' && req.url.pathname.endsWith('/files')) return json({ files: [] });
      if (req.method === 'GET') return new Response('text');
      if (req.method === 'PATCH') return json({ file: { id: 'f1', path: 'b.md' } });
      if (req.method === 'DELETE') return json({ success: true });
      return json({ file: rawFile('f1', 'a.md') }, req.method === 'POST' ? 201 : 200);
    });
    const client = makeClient();

    await client.whoami();
    await client.listProjects();
    await client.listFiles('p1', { path: 'a.md' });
    await client.readFile('p1', 'f1');
    await client.createFile('p1', 'a.md', 'x');
    await client.updateFile('p1', 'f1', 'y');
    await client.moveFile('p1', 'f1', 'b.md');
    await client.deleteFile('p1', 'f1');
    await client.listVersions('p1', 'f1');

    expect(calls).toHaveLength(9);
    for (const req of calls) {
      expect(req.headers.get('X-API-Key'), describeCall(req)).toBe(API_KEY);
      expect(req.headers.has('Authorization'), describeCall(req)).toBe(false);
      expect(req.headers.has('Cookie'), describeCall(req)).toBe(false);
    }
  });

  it('strips trailing slashes from the base URL', async () => {
    const calls = mockFetch(() => json({ projects: [] }));

    await makeClient('https://vault.test/base//').listProjects();

    expect(calls[0]?.url.href).toBe('https://vault.test/base/api/projects');
  });
});

describe('TeamVaultClient: account and projects', () => {
  it('whoami returns the user from /api/auth/me', async () => {
    mockFetch(() => json({ user: { id: 'u1', email: 'dev@krem.digital', name: 'Dev' } }));

    await expect(makeClient().whoami()).resolves.toEqual({
      id: 'u1',
      email: 'dev@krem.digital',
      name: 'Dev',
    });
  });

  it('listProjects keeps only id, slug and name', async () => {
    mockFetch(() =>
      json({ projects: [{ id: 'p1', slug: 's1', name: 'Vault', ownerId: 'u1', role: 'ADMIN' }] }),
    );

    await expect(makeClient().listProjects()).resolves.toEqual([
      { id: 'p1', slug: 's1', name: 'Vault' },
    ]);
  });
});

describe('TeamVaultClient: path → fileId resolution (listFiles)', () => {
  it('asks the server for exactly one path via GET /files?path=', async () => {
    const path = 'персонажи/кузьма минин #1 & co.md';
    const calls = mockFetch(() => json({ files: [rawFile('f1', path)] }));

    const files = await makeClient().listFiles('p1', { path });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url.pathname).toBe('/api/projects/p1/files');
    // Round-trips through the query string intact: spaces, `#`, `&`, Cyrillic.
    expect([...(calls[0]?.url.searchParams.keys() ?? [])]).toEqual(['path']);
    expect(calls[0]?.url.searchParams.get('path')).toBe(path);
    expect(files.map((f) => f.id)).toEqual(['f1']);
  });

  it('returns an empty list when the server answers 200 with no files (missing path)', async () => {
    const calls = mockFetch(() => json({ files: [] }));

    await expect(makeClient().listFiles('p1', { path: 'нет/такой.md' })).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('parses the file record: size from a BigInt string, extra fields dropped', async () => {
    mockFetch(() =>
      json({
        files: [
          rawFile('f1', 'img.png', { fileType: 'BINARY', size: '9007199254', mimeType: null }),
        ],
      }),
    );

    await expect(makeClient().listFiles('p1', { path: 'img.png' })).resolves.toEqual([
      { id: 'f1', path: 'img.png', fileType: 'BINARY', size: 9007199254, mimeType: null },
    ]);
  });

  it('sends prefix for a subtree and no query string without a filter', async () => {
    const calls = mockFetch(() => json({ files: [] }));
    const client = makeClient();

    await client.listFiles('p1', { prefix: 'персонажи/' });
    await client.listFiles('p1');

    expect(calls[0]?.url.searchParams.get('prefix')).toBe('персонажи/');
    expect(calls[0]?.url.searchParams.has('path')).toBe(false);
    expect(calls[1]?.url.search).toBe('');
  });

  it('percent-encodes projectId and fileId in the URL path', async () => {
    const calls = mockFetch(() => new Response('body'));

    await makeClient().readFile('p/1?x', 'f#1');

    expect(calls[0]?.url.pathname).toBe('/api/projects/p%2F1%3Fx/files/f%231');
  });
});

describe('TeamVaultClient: writes', () => {
  it('createFile posts multipart form data with the path and the content', async () => {
    const calls = mockFetch(() =>
      json({ file: rawFile('f9', 'события/новая.md', { size: '7' }) }, 201),
    );

    const file = await makeClient().createFile('p1', 'события/новая.md', 'привет');

    const req = calls[0];
    expect(req && describeCall(req)).toBe('POST /api/projects/p1/files');
    const form = req?.body;
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get('path')).toBe('события/новая.md');
    const blob = (form as FormData).get('file') as File;
    expect(blob.name).toBe('новая.md');
    expect(blob.type).toBe('text/markdown');
    await expect(blob.text()).resolves.toBe('привет');
    // The multipart boundary is fetch's to set: a hand-written Content-Type
    // would drop it and the server would reject the upload.
    expect(req?.headers.has('Content-Type')).toBe(false);
    const wire = new Request(req?.url ?? '', { method: 'POST', body: form ?? null });
    expect(wire.headers.get('Content-Type')).toMatch(/^multipart\/form-data; boundary=/);
    expect(file).toEqual({
      id: 'f9',
      path: 'события/новая.md',
      fileType: 'TEXT',
      size: 7,
      mimeType: 'text/markdown',
    });
  });

  it('updateFile puts the raw content as octet-stream', async () => {
    const calls = mockFetch(() => json({ file: rawFile('f1', 'a.md', { size: '5' }) }));

    const file = await makeClient().updateFile('p1', 'f1', 'новое');

    expect(calls[0] && describeCall(calls[0])).toBe('PUT /api/projects/p1/files/f1');
    expect(calls[0]?.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(calls[0]?.body).toBe('новое');
    expect(file.size).toBe(5);
  });

  it('moveFile patches the file with a JSON newPath', async () => {
    const calls = mockFetch(() => json({ file: { id: 'f1', path: 'b/c.md' } }));

    await expect(makeClient().moveFile('p1', 'f1', 'b/c.md')).resolves.toEqual({
      id: 'f1',
      path: 'b/c.md',
    });
    expect(calls[0] && describeCall(calls[0])).toBe('PATCH /api/projects/p1/files/f1');
    expect(calls[0]?.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(calls[0]?.body))).toEqual({ newPath: 'b/c.md' });
  });

  it('deleteFile sends DELETE', async () => {
    const calls = mockFetch(() => json({ success: true }));

    await expect(makeClient().deleteFile('p1', 'f1')).resolves.toBeUndefined();
    expect(calls[0] && describeCall(calls[0])).toBe('DELETE /api/projects/p1/files/f1');
  });

  it('readFile and listVersions return the body as is', async () => {
    const versions = [
      { id: 'v2', versionNumber: 2, contentHash: 'h2', message: null, createdAt: '2026-09-02' },
    ];
    const calls = mockFetch((req) =>
      req.url.pathname.endsWith('/versions') ? json({ versions }) : new Response('# Заметка\n'),
    );
    const client = makeClient();

    await expect(client.readFile('p1', 'f1')).resolves.toBe('# Заметка\n');
    await expect(client.listVersions('p1', 'f1')).resolves.toEqual(versions);
    expect(calls.map(describeCall)).toEqual([
      'GET /api/projects/p1/files/f1',
      'GET /api/projects/p1/files/f1/versions',
    ]);
  });
});

describe('TeamVaultClient: errors', () => {
  it('404 → TeamVaultError with the status and the server message', async () => {
    mockFetch(() => apiError(404, 'not_found', 'Проект не найден'));

    const err = await rejection(makeClient().listFiles('gone', { path: 'a.md' }));

    expect(err.name).toBe('TeamVaultError');
    expect(err.status).toBe(404);
    expect(err.message).toBe(
      'GET /api/projects/gone/files?path=a.md → HTTP 404: {"error":{"code":"not_found","message":"Проект не найден"}}',
    );
  });

  it('409 path_exists on create → TeamVaultError 409 carrying the code', async () => {
    mockFetch(() => apiError(409, 'path_exists', 'Файл с таким путём уже существует'));

    const err = await rejection(makeClient().createFile('p1', 'a.md', 'x'));

    expect(err.status).toBe(409);
    expect(err.message).toMatch(/^POST \/api\/projects\/p1\/files → HTTP 409: /);
    expect(err.message).toContain('path_exists');
  });

  it('409 path_exists on move → TeamVaultError 409 carrying the code', async () => {
    mockFetch(() => apiError(409, 'path_exists', 'Файл с таким путём уже существует'));

    const err = await rejection(makeClient().moveFile('p1', 'f1', 'taken.md'));

    expect(err.status).toBe(409);
    expect(err.message).toContain('PATCH /api/projects/p1/files/f1 → HTTP 409');
    expect(err.message).toContain('path_exists');
  });

  it.each([500, 502, 503])('%i → TeamVaultError with that status', async (status) => {
    mockFetch(() => new Response('upstream is down', { status }));

    const err = await rejection(makeClient().readFile('p1', 'f1'));

    expect(err.status).toBe(status);
    expect(err.message).toBe(`GET /api/projects/p1/files/f1 → HTTP ${status}: upstream is down`);
  });

  it('5xx without a body → message ends at the status', async () => {
    mockFetch(() => new Response(null, { status: 500 }));

    const err = await rejection(makeClient().listProjects());

    expect(err.message).toBe('GET /api/projects → HTTP 500');
  });

  it('long error bodies are cut to 400 characters', async () => {
    mockFetch(() => new Response(`<html>${'x'.repeat(5000)}</html>`, { status: 502 }));

    const err = await rejection(makeClient().listProjects());

    expect(err.message).toBe(`GET /api/projects → HTTP 502: <html>${'x'.repeat(394)}`);
  });

  it('a network failure → TeamVaultError with status 0', async () => {
    mockFetch(() => {
      throw new TypeError('fetch failed');
    });

    const err = await rejection(makeClient().whoami());

    expect(err.status).toBe(0);
    expect(err.message).toBe('Network error on GET /api/auth/me: fetch failed');
  });
});
