// The decisions in spec/web.md, checked against a real server on a free port, with GitHub
// answering from tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { serve } from '../src/web.ts';
import { CLI, EXAMPLE_COMMIT, FIXTURE, open } from './helpers.ts';

const { server, url } = await serve({ open, port: 0 });
after(() => server.close());

type Answer = {
  repository: { id: string };
  skills: { name: string; path: string; link: string; text: string; copies: string[] }[];
  warnings: string[];
  error?: string;
};

/** `GET /api/scan`, with the answer typed. */
async function scanned(repo: string) {
  const response = await fetch(`${url}api/scan?repo=${encodeURIComponent(repo)}`);
  return { status: response.status, json: () => response.json() as Promise<Answer> };
}

test('the page: a repository field with the Scan button to its right, the list and the SKILL.md view', async () => {
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  const page = await response.text();
  assert.match(page, /<form id="scan">\s*<input id="repo"[^>]*>\s*<button type="submit">Scan<\/button>\s*<\/form>/);
  assert.match(page, /<ul id="skills"[^>]*><\/ul>\s*<section id="skill"/);
});

test('a GitHub repository: its skills with the SKILL.md text and the pinned link', async () => {
  const response = await scanned('https://github.com/JetBrains/example');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.repository.id, 'JetBrains/example');
  assert.deepEqual(result.warnings, []);
  assert.equal(result.skills.length, 1);
  const [skill] = result.skills;
  assert.equal(skill.name, 'commits');
  assert.equal(skill.link, `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`);
  assert.equal(
    skill.text,
    '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
  );
});

test('./fixture: every skill sorted by name, each with its own file, and a warning for the malformed one', async () => {
  const result = await (await scanned(FIXTURE)).json();
  assert.equal(result.repository.id, 'fixture');
  assert.deepEqual(
    result.skills.map((skill) => skill.name),
    ['code-style', 'commits', 'release-checklist', 'writing-lint-checks'],
  );
  const root = pathToFileURL(FIXTURE).href;
  for (const skill of result.skills) {
    assert.equal(skill.link, `${root}/${skill.path}`);
    assert.equal(skill.text, readFileSync(join(FIXTURE, skill.path), 'utf8'));
  }
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /^\.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('./fixture: a skill in several roots → one item, its .agents file, with its copies', async () => {
  const { skills } = await (await scanned(FIXTURE)).json();
  const commits = skills.filter((skill) => skill.name === 'commits');
  assert.equal(commits.length, 1);
  assert.equal(commits[0].path, '.agents/skills/commits/SKILL.md');
  assert.deepEqual(commits[0].copies, ['.claude/skills/commits/SKILL.md']);
});

test('GitHub: only skills in skill roots; the product, test data and nested roots left out, silently', async () => {
  const result = await (await scanned('https://github.com/JetBrains/edge-cases')).json();
  assert.deepEqual(
    result.skills.map(({ name, path, copies }) => ({ name, path, copies })),
    [
      { name: 'mps-tests', path: '.agents/skills/mps-tests/SKILL.md', copies: ['.claude/skills/mps-tests/SKILL.md'] },
      { name: 'writing-lint-checks', path: 'agent/skills/writing-lint-checks/SKILL.md', copies: [] },
    ],
  );
  assert.deepEqual(result.warnings, []);
});

test('the page shows a skill\'s copies', async () => {
  assert.match(await (await fetch(url)).text(), /also in \$\{skill\.copies\.join\(', '\)\}/);
});

test('unreachable repository → the CLI message, status 400, no skills', async () => {
  const missing = await scanned(join(FIXTURE, 'no-such-directory'));
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error ?? '', /^Not a GitHub URL or a readable directory: .*no-such-directory$/);

  const offline = await scanned('https://github.com/JetBrains/not-answered');
  assert.equal(offline.status, 400);
  assert.deepEqual(await offline.json(), {
    error: 'Cannot reach GitHub: not recorded: https://api.github.com/repos/JetBrains/not-answered',
  });

  const empty = await scanned(' ');
  assert.equal(empty.status, 400);
  assert.deepEqual(await empty.json(), { error: 'Enter a GitHub URL or a directory' });
});

test('./skill-atlas serve listens on localhost, on the port asked for', async (t) => {
  const child = spawn(process.execPath, [CLI, 'serve', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const line = await new Promise<string>((resolve, reject) => {
    child.stdout.setEncoding('utf8').once('data', resolve);
    child.once('exit', (code) => reject(new Error(`exited with ${code}`)));
  });
  const [, served] = /^Skill Atlas at (http:\/\/127\.0\.0\.1:\d+\/)\n$/.exec(line) ?? [];
  assert.ok(served, line);
  assert.equal((await fetch(served)).status, 200);
});

test('./skill-atlas serve with a bad port → usage, exit code 1', async () => {
  const child = spawn(process.execPath, [CLI, 'serve', '--port', 'x'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (text) => (stderr += text));
  const code = await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(code, 1);
  assert.equal(stderr, 'Usage: skill-atlas serve [--port <port>]\n');
});
