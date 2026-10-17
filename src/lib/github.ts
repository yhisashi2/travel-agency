/** GitHub Contents API の最小クライアント（データリポジトリの trips/*.json を読み書き） */

export interface GitHubSettings {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  dir: string;
}

const SETTINGS_KEY = 'ta.github';

export function loadSettings(): GitHubSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GitHubSettings;
    return s.owner && s.repo && s.token ? { ...s, dir: s.dir || 'trips', branch: s.branch || 'main' } : null;
  } catch {
    return null;
  }
}

export function saveSettings(s: GitHubSettings | null) {
  if (s) localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  else localStorage.removeItem(SETTINGS_KEY);
}

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RemoteFile {
  path: string;
  sha: string;
  text: string;
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function decodeBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class GitHubClient {
  constructor(private s: GitHubSettings) {}

  private async req(path: string, init: RequestInit = {}) {
    const res = await fetch(`https://api.github.com/repos/${this.s.owner}/${this.s.repo}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.s.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = (await res.json()).message ?? msg;
      } catch {
        /* ignore */
      }
      throw new GitHubError(res.status, msg);
    }
    return res.status === 204 ? null : res.json();
  }

  async checkAccess(): Promise<{ private: boolean; canPush: boolean }> {
    const r = await this.req('');
    return { private: r.private, canPush: !!r.permissions?.push };
  }

  /** trips ディレクトリ内の .json ファイル一覧（ディレクトリが無ければ空） */
  async listTrips(): Promise<{ path: string; sha: string }[]> {
    try {
      const items = (await this.req(`/contents/${this.s.dir}?ref=${encodeURIComponent(this.s.branch)}`)) as {
        type: string;
        name: string;
        path: string;
        sha: string;
      }[];
      return items.filter((i) => i.type === 'file' && i.name.endsWith('.json')).map((i) => ({ path: i.path, sha: i.sha }));
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return [];
      throw e;
    }
  }

  async getFile(path: string): Promise<RemoteFile | null> {
    try {
      const r = await this.req(`/contents/${path}?ref=${encodeURIComponent(this.s.branch)}`);
      return { path, sha: r.sha, text: decodeBase64(r.content) };
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return null;
      throw e;
    }
  }

  /** 書き込み。sha 不一致時は GitHubError(409) を投げる。新しい sha を返す */
  async putFile(path: string, text: string, message: string, sha?: string): Promise<string> {
    const r = await this.req(`/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: encodeBase64(text), branch: this.s.branch, ...(sha ? { sha } : {}) }),
    });
    return r.content.sha;
  }

  async deleteFile(path: string, sha: string, message: string): Promise<void> {
    await this.req(`/contents/${path}`, {
      method: 'DELETE',
      body: JSON.stringify({ message, sha, branch: this.s.branch }),
    });
  }

  tripPath(id: string) {
    return `${this.s.dir}/${id}.json`;
  }
}
