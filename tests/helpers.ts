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

/** The description of `long` in JetBrains/long-descriptions: 354 characters, ending in "the end". */
export const LONG_DESCRIPTION = `Builds ${'abcdefghij'.repeat(34)}the end`;

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
  ...LONG_DESCRIPTIONS(),
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

/** JetBrains/long-descriptions: `fits`, with the first 350 characters of `long`, and `long`. */
function LONG_DESCRIPTIONS(): Recording {
  const raw = `https://raw.githubusercontent.com/JetBrains/long-descriptions/${EXAMPLE_COMMIT}`;
  const skill = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n`;
  return {
    'https://api.github.com/repos/JetBrains/long-descriptions': { status: 200, body: { full_name: 'JetBrains/long-descriptions', default_branch: 'main' } },
    'https://api.github.com/repos/JetBrains/long-descriptions/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
    'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/long-descriptions&per_page=100&page=1': {
      status: 200,
      body: { total_count: 2, items: [{ path: '.claude/skills/fits/SKILL.md' }, { path: '.claude/skills/long/SKILL.md' }] },
    },
    [`${raw}/.claude/skills/fits/SKILL.md`]: { status: 200, body: skill('fits', LONG_DESCRIPTION.slice(0, 350)) },
    [`${raw}/.claude/skills/long/SKILL.md`]: { status: 200, body: skill('long', LONG_DESCRIPTION) },
  };
}

const github = replay(EXAMPLE);

/** What to scan, as the CLI opens it, with GitHub answering from EXAMPLE through code search. */
export const open = (input: string) =>
  parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: 'test' }) : openDirectory(input);

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from EXAMPLE. */
export async function atlas(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    open,
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}
