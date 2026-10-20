import { AtlasError } from './errors.ts';
import { SKILL_ROOTS } from './find.ts';
import type { OrganizationSource, Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  /** With a token, skills are found through code search; without it, through the tree. */
  token?: string;
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/**
 * `https://github.com/owner/repo`, with or without the scheme, a trailing slash or `.git`;
 * without the repository, `https://github.com/owner`, an organization.
 */
export function parseGitHubUrl(input: string): { owner: string; repo?: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)(?:\/([\w.-]+?)(?:\.git)?)?\/?$/i.exec(input.trim());
  return match ? { owner: match[1], repo: match[2] } : undefined;
}

/** A repository, or all the repositories of an organization. */
export async function openGitHub(input: string, options: GitHubOptions): Promise<Source | OrganizationSource> {
  const name = parseGitHubUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub repository URL: ${input}`);
  const github = client(options);
  if (!name.repo) return openOrganization(github, name.owner, options);
  const info = await github.json<{ full_name: string; default_branch: string }>(
    `${API}/repos/${name.owner}/${name.repo}`,
    `Repository not found: https://github.com/${name.owner}/${name.repo}`,
  );
  const id = info.full_name;
  return openRepository(github, id, info.default_branch, (sha) =>
    options.token ? searchPaths(github, `repo:${id}`).then((items) => items.map((item) => item.path)) : treePaths(github, id, sha),
  );
}

/** Resolves the default branch to a commit and lists the files that may be skills. */
async function openRepository(
  github: Client,
  id: string,
  branch: string,
  list: (sha: string) => Promise<string[]>,
): Promise<Source> {
  const { sha } = await github.json<{ sha: string }>(`${API}/repos/${id}/commits/${encodePath(branch)}`);
  const paths = await list(sha);
  const [organization, repo] = id.split('/');
  return {
    repository: { id, organization, name: repo, url: `https://github.com/${id}`, commit: sha },
    paths,
    warnings: [],
    read: (path) => github.raw(`${RAW}/${id}/${sha}/${encodePath(path)}`),
  };
}

type Listed = { full_name: string; default_branch: string; fork: boolean };

/** How many repositories of an organization are opened at the same time. */
const PARALLEL = 8;

/**
 * Every repository. With a token, one code search finds the skills of the whole organization, and
 * only the repositories it finds them in are opened; code search leaves forks out, so they are
 * listed through their trees. A repository that cannot be opened is a warning; GitHub refusing to
 * answer at all stops the scan.
 */
async function openOrganization(github: Client, owner: string, options: GitHubOptions): Promise<OrganizationSource> {
  const account = await github.json<{ login: string; type: string }>(
    `${API}/users/${owner}`,
    `Organization not found: https://github.com/${owner}`,
  );
  const kind = account.type === 'Organization' ? 'org' : 'user';
  const listed: Listed[] = [];
  for (let page = 1; ; page++) {
    const repositories = await github.json<Listed[]>(
      `${API}/${kind === 'org' ? 'orgs' : 'users'}/${account.login}/repos?per_page=100&page=${page}`,
    );
    listed.push(...repositories);
    if (repositories.length < 100) break;
  }
  const found = new Map<string, string[]>();
  if (options.token) {
    for (const item of await searchPaths(github, `${kind}:${account.login}`)) {
      const id = item.repository?.full_name ?? '';
      found.set(id, [...(found.get(id) ?? []), item.path]);
    }
  }
  const searched = (repository: Listed) => options.token !== undefined && !repository.fork;
  const toOpen = listed
    .filter((repository) => !searched(repository) || found.has(repository.full_name))
    .sort((a, b) => compare(a.full_name, b.full_name));
  const warnings: string[] = [];
  const opened = await inParallel(toOpen, async (repository) => {
    const { full_name: id, default_branch: branch } = repository;
    const list = (sha: string) => (searched(repository) ? Promise.resolve(found.get(id)!) : treePaths(github, id, sha));
    try {
      return await openRepository(github, id, branch, list);
    } catch (error) {
      if (!(error instanceof AtlasError) || error instanceof RefusedError) throw error;
      warnings.push(`${id}: skipped: ${error.message}`);
      return undefined;
    }
  });
  return {
    organization: { id: account.login, url: `https://github.com/${account.login}` },
    scanned: listed.length - warnings.length,
    sources: opened.filter((source) => source !== undefined),
    warnings: warnings.sort(compare),
  };
}

/** `run` on every item, `PARALLEL` at a time; the results in the items' order. */
async function inParallel<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
  return results;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type Found = { path: string; repository?: { full_name: string } };

/** Code search looks at the whole default branch, 100 results a page; `qualifier` is `repo:…`, `org:…` or `user:…`. */
async function searchPaths(github: Client, qualifier: string): Promise<Found[]> {
  const items = new Map<string, Found>(); // pages can repeat a result
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: Found[] }>(
      `${API}/search/code?q=filename:SKILL.md+${qualifier}&per_page=100&page=${page}`,
    );
    for (const item of result.items) items.set(`${item.repository?.full_name}:${item.path}`, item);
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
  }
  return [...items.values()];
}

type Tree = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/** The whole tree at once, or only the skill roots, where skills are, when it is too large for one answer. */
async function treePaths(github: Client, id: string, sha: string): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  const paths: string[] = [];
  for (const root of SKILL_ROOTS) {
    const rootSha = await directory(github, id, sha, root);
    if (!rootSha) continue;
    const subtree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}?recursive=1`);
    paths.push(...files(subtree).map((path) => `${root}/${path}`));
  }
  return paths;
}

/** Walks down one level at a time; the directory's tree, or undefined if it does not exist. */
async function directory(github: Client, id: string, sha: string, path: string): Promise<string | undefined> {
  let current = sha;
  for (const segment of path.split('/')) {
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${current}`);
    const entry = tree.tree.find((item) => item.path === segment && item.type === 'tree');
    if (!entry) return undefined;
    current = entry.sha;
  }
  return current;
}

/** Regular files only: a symbolic link's content is its target, not a SKILL.md. */
function files(tree: Tree): string[] {
  return tree.tree.filter((item) => item.type === 'blob' && item.mode !== '120000').map((item) => item.path);
}

type Client = ReturnType<typeof client>;

/** GitHub refuses to answer at all: unreachable, the rate limit or the token. No repository can be scanned. */
class RefusedError extends AtlasError {}

function client({ fetch, token }: GitHubOptions) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answers = new Map<string, Promise<unknown>>(); // the root tree is asked for once per skill root

  async function get(url: string, init?: { headers: Record<string, string> }): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new RefusedError(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  async function request(url: string, notFound: string): Promise<unknown> {
    const response = await get(url, { headers });
    if (response.ok) return response.json();
    const body: unknown = await response.json().catch(() => undefined);
    const message = (body as { message?: unknown } | undefined)?.message;
    const text = typeof message === 'string' ? message : '';
    if (response.status === 404) throw new AtlasError(notFound);
    if ((response.status === 403 || response.status === 429) && /rate limit/i.test(text)) {
      throw new RefusedError(`GitHub rate limit reached; ${token ? 'try again in a minute' : 'set GITHUB_TOKEN'}`);
    }
    if (response.status === 401) throw new RefusedError('GitHub rejected the token in GITHUB_TOKEN');
    throw new AtlasError(`GitHub answered ${response.status} for ${url}${text && `: ${text}`}`);
  }

  return {
    /** A GitHub API answer; `notFound` explains a 404. */
    json<T>(url: string, notFound = `Not found on GitHub: ${url}`): Promise<T> {
      if (!answers.has(url)) answers.set(url, request(url, notFound));
      return answers.get(url) as Promise<T>;
    },
    /** A file's bytes at the scanned commit, or undefined if it is not there. */
    async raw(url: string): Promise<Uint8Array | undefined> {
      const response = await get(url);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new AtlasError(`GitHub answered ${response.status} for ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
