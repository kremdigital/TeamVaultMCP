/**
 * Thin REST client for the Team Vault server, mirroring the endpoints the
 * Obsidian plugin uses. Authenticates with the `X-API-Key` header.
 */

export interface TeamVaultConfig {
  baseUrl: string;
  apiKey: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
}

export interface VaultFile {
  id: string;
  path: string;
  fileType: 'TEXT' | 'BINARY';
  size: number;
  mimeType: string | null;
}

export interface FileVersion {
  id: string;
  versionNumber: number;
  contentHash: string;
  message: string | null;
  createdAt: string;
}

export class TeamVaultError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'TeamVaultError';
    this.status = status;
  }
}

type RawFile = Omit<VaultFile, 'size'> & { size: string | number };

export class TeamVaultClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: TeamVaultConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
  }

  private async request(
    method: string,
    path: string,
    options: { body?: string | FormData; contentType?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { 'X-API-Key': this.apiKey };
    if (options.contentType) headers['Content-Type'] = options.contentType;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(options.body !== undefined ? { body: options.body } : {}),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new TeamVaultError(`Network error on ${method} ${path}: ${detail}`, 0);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new TeamVaultError(
        `${method} ${path} → HTTP ${res.status}${text ? `: ${text.slice(0, 400)}` : ''}`,
        res.status,
      );
    }
    return res;
  }

  private static parseFile(raw: RawFile): VaultFile {
    return {
      id: raw.id,
      path: raw.path,
      fileType: raw.fileType,
      size: Number(raw.size),
      mimeType: raw.mimeType,
    };
  }

  async whoami(): Promise<{ id: string; email: string; name: string | null }> {
    const res = await this.request('GET', '/api/auth/me');
    const body = (await res.json()) as {
      user: { id: string; email: string; name: string | null };
    };
    return body.user;
  }

  async listProjects(): Promise<Project[]> {
    const res = await this.request('GET', '/api/projects');
    const body = (await res.json()) as { projects: Project[] };
    return body.projects.map((p) => ({ id: p.id, slug: p.slug, name: p.name }));
  }

  async listFiles(projectId: string): Promise<VaultFile[]> {
    const res = await this.request('GET', `/api/projects/${encodeURIComponent(projectId)}/files`);
    const body = (await res.json()) as { files: RawFile[] };
    return body.files.map(TeamVaultClient.parseFile);
  }

  async readFile(projectId: string, fileId: string): Promise<string> {
    const res = await this.request(
      'GET',
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`,
    );
    return res.text();
  }

  async createFile(
    projectId: string,
    path: string,
    content: string,
    mimeType = 'text/markdown',
  ): Promise<VaultFile> {
    const form = new FormData();
    form.append('path', path);
    form.append('file', new Blob([content], { type: mimeType }), path.split('/').pop() ?? 'file');
    const res = await this.request('POST', `/api/projects/${encodeURIComponent(projectId)}/files`, {
      body: form,
    });
    const body = (await res.json()) as { file: RawFile };
    return TeamVaultClient.parseFile(body.file);
  }

  async updateFile(projectId: string, fileId: string, content: string): Promise<VaultFile> {
    const res = await this.request(
      'PUT',
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`,
      { body: content, contentType: 'application/octet-stream' },
    );
    const body = (await res.json()) as { file: RawFile };
    return TeamVaultClient.parseFile(body.file);
  }

  async moveFile(
    projectId: string,
    fileId: string,
    newPath: string,
  ): Promise<{ id: string; path: string }> {
    const res = await this.request(
      'PATCH',
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`,
      { body: JSON.stringify({ newPath }), contentType: 'application/json' },
    );
    const body = (await res.json()) as { file: { id: string; path: string } };
    return body.file;
  }

  async deleteFile(projectId: string, fileId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`,
    );
  }

  async listVersions(projectId: string, fileId: string): Promise<FileVersion[]> {
    const res = await this.request(
      'GET',
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/versions`,
    );
    const body = (await res.json()) as { versions: FileVersion[] };
    return body.versions;
  }
}
