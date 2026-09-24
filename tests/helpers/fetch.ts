import { vi } from 'vitest';

/** One `fetch` call as the client made it. */
export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: RequestInit['body'];
}

export type FetchHandler = (req: RecordedRequest) => Response | Promise<Response>;

/**
 * Replaces the global `fetch` for the current test. Every call is recorded
 * and answered by `handler`; nothing leaves the process.
 */
export function mockFetch(handler: FetchHandler): RecordedRequest[] {
  const calls: RecordedRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const req: RecordedRequest = {
        method: init?.method ?? 'GET',
        url: new URL(input instanceof Request ? input.url : input),
        headers: new Headers(init?.headers),
        body: init?.body,
      };
      calls.push(req);
      return handler(req);
    }),
  );
  return calls;
}

/** `METHOD /path?query`, the way the assertions read the call log. */
export function describeCall(req: RecordedRequest): string {
  return `${req.method} ${req.url.pathname}${req.url.search}`;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The server's error envelope (`src/lib/http/errors.ts` there). */
export function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

/**
 * A file record as the server's `GET /files` returns it: `size` is a BigInt
 * serialised as a string, and there are fields the client does not expose.
 */
export function rawFile(
  id: string,
  path: string,
  overrides: Partial<{ fileType: 'TEXT' | 'BINARY'; size: string; mimeType: string | null }> = {},
) {
  return {
    id,
    path,
    fileType: overrides.fileType ?? 'TEXT',
    contentHash: 'sha256-of-content',
    size: overrides.size ?? '12',
    mimeType: overrides.mimeType === undefined ? 'text/markdown' : overrides.mimeType,
    deletedAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
    lastModifiedById: 'user-1',
  };
}
