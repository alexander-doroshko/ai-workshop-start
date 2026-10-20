// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE below.
import { fileURLToPath } from 'node:url';
import { run } from '../src/commands.ts';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';

/** The commit GitHub answers for octo/skills. */
export const OCTO_COMMIT = '0c70c70c70c70c70c70c70c70c70c70c70c70c70';

/** What GitHub answers for a small repository, JetBrains/example, with one skill. */
const EXAMPLE: Recording = {
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: { total_count: 1, items: [{ path: '.claude/skills/commits/SKILL.md' }] },
  },
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
  },
  ...EDGE_CASES(),
  ...ORGANIZATION(),
  ...USER(),
};

/**
 * JetBrains/edge-cases: where skills live in real repositories. Only the main copies of
 * the project's own skills are answered: reading anything else fails the scan.
 */
function EDGE_CASES(): Recording {
  const search = 'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/edge-cases&per_page=100&page=1';
  const raw = `https://raw.githubusercontent.com/JetBrains/edge-cases/${EXAMPLE_COMMIT}`;
  const paths = [
    '.agents/skills/mps-tests/SKILL.md',
    '.claude/skills/mps-tests/SKILL.md',
    'agent/skills/writing-lint-checks/SKILL.md',
    'plugins/mcp-tools/resources/jetbrains/mps/skills/mps-aspect-generator/SKILL.md',
    'integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md',
    'fixture/.claude/skills/commits/SKILL.md',
    '.claude/skills/mps-tests/references/SKILL.md',
    'SKILL.md',
  ];
  return {
    'https://api.github.com/repos/JetBrains/edge-cases': { status: 200, body: { full_name: 'JetBrains/edge-cases', default_branch: 'main' } },
    'https://api.github.com/repos/JetBrains/edge-cases/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
    [search]: { status: 200, body: { total_count: paths.length, items: paths.map((path) => ({ path })) } },
    [`${raw}/.agents/skills/mps-tests/SKILL.md`]: {
      status: 200,
      body: '---\nname: mps-tests\ndescription: Run the MPS tests. Use before every push.\n---\n',
    },
    [`${raw}/agent/skills/writing-lint-checks/SKILL.md`]: {
      status: 200,
      body: '---\nname: writing-lint-checks\ndescription: Write a lint check the way this repository does.\n---\n',
    },
  };
}

/**
 * The organization JetBrains, searched with a token: JetBrains/example and JetBrains/edge-cases
 * above, a repository without skills that is never opened, and a fork, which code search leaves
 * out, listed through its tree. What the search says about the fork is not used.
 */
function ORGANIZATION(): Recording {
  const forked = `https://raw.githubusercontent.com/JetBrains/forked/${OCTO_COMMIT}`;
  const repository = (name: string, fork = false) => ({ full_name: `JetBrains/${name}`, default_branch: 'main', fork });
  const found = (name: string, path: string) => ({ path, repository: { full_name: `JetBrains/${name}` } });
  const items = [
    found('example', '.claude/skills/commits/SKILL.md'),
    found('edge-cases', '.agents/skills/mps-tests/SKILL.md'),
    found('edge-cases', '.claude/skills/mps-tests/SKILL.md'),
    found('edge-cases', 'agent/skills/writing-lint-checks/SKILL.md'),
    found('edge-cases', 'fixture/.claude/skills/commits/SKILL.md'),
    found('forked', '.claude/skills/not-in-the-fork/SKILL.md'),
  ];
  return {
    'https://api.github.com/users/JetBrains': { status: 200, body: { login: 'JetBrains', type: 'Organization' } },
    'https://api.github.com/orgs/JetBrains/repos?per_page=100&page=1': {
      status: 200,
      body: [repository('example'), repository('no-skills'), repository('forked', true), repository('edge-cases')],
    },
    'https://api.github.com/search/code?q=filename:SKILL.md+org:JetBrains&per_page=100&page=1': {
      status: 200,
      body: { total_count: items.length, items },
    },
    'https://api.github.com/repos/JetBrains/forked/commits/main': { status: 200, body: { sha: OCTO_COMMIT } },
    [`https://api.github.com/repos/JetBrains/forked/git/trees/${OCTO_COMMIT}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: [blob('.github/skills/upstream/SKILL.md')] },
    },
    [`${forked}/.github/skills/upstream/SKILL.md`]: {
      status: 200,
      body: '---\nname: upstream\ndescription: A skill the fork keeps from upstream.\n---\n',
    },
    'https://api.github.com/users/no-such-organization': { status: 404, body: { message: 'Not Found' } },
  };
}

/**
 * A user's account, octo, listed without a token, through each repository's tree: octo/skills with a
 * skill without front matter, octo/empty that GitHub cannot answer for, and a fork without skills.
 */
function USER(): Recording {
  const repository = (name: string, fork = false) => ({ full_name: `octo/${name}`, default_branch: 'main', fork });
  return {
    'https://api.github.com/users/octo': { status: 200, body: { login: 'octo', type: 'User' } },
    'https://api.github.com/users/octo/repos?per_page=100&page=1': {
      status: 200,
      body: [repository('skills'), repository('forked', true), repository('empty')],
    },
    'https://api.github.com/repos/octo/skills/commits/main': { status: 200, body: { sha: OCTO_COMMIT } },
    [`https://api.github.com/repos/octo/skills/git/trees/${OCTO_COMMIT}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: [blob('README.md'), blob('.claude/skills/review/SKILL.md')] },
    },
    [`https://raw.githubusercontent.com/octo/skills/${OCTO_COMMIT}/.claude/skills/review/SKILL.md`]: { status: 200, body: '# Review\n' },
    'https://api.github.com/repos/octo/forked/commits/main': { status: 200, body: { sha: OCTO_COMMIT } },
    [`https://api.github.com/repos/octo/forked/git/trees/${OCTO_COMMIT}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: [blob('README.md')] },
    },
    'https://api.github.com/repos/octo/empty/commits/main': { status: 409, body: { message: 'Git Repository is empty.' } },
  };
}

/** A regular file in a recorded tree. */
function blob(path: string) {
  return { path, mode: '100644', type: 'blob', sha: OCTO_COMMIT };
}

const github = replay(EXAMPLE);

/** What to scan, as the CLI opens it, with GitHub answering from EXAMPLE; through code search with a token. */
export const openWith = (token: string | undefined) => (input: string) =>
  parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token }) : openDirectory(input);

export const open = openWith('test');

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from EXAMPLE; without a token, through the tree. */
export async function atlas(args: string[], options: { token?: string } = { token: 'test' }) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    open: openWith(options.token),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}
