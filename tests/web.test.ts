// The decisions in spec/web.md, checked against a real server on a free port, with GitHub
// answering from tests/helpers.ts. The page runs its own script, src/web/page.js, on its own
// markup, in linkedom.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { get } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { parseHTML } from 'linkedom';
import { createBrowserBackend } from '../src/browser.ts';
import { start } from '../src/web/page.js';
import { serve } from '../src/web.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE, open } from './helpers.ts';

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

/** The served page, running page.js against this server: type, Scan, click. */
async function page() {
  const { window, document } = parseHTML(await (await fetch(url)).text());
  start(document, (repo: string) => fetch(`${url}api/scan?repo=${encodeURIComponent(repo)}`));
  const element = (id: string) => document.getElementById(id)!;
  const button = document.querySelector('#scan button')!;
  const items = () => [...document.querySelectorAll('#skills li')];
  return {
    /** The status line: the repository and the count, then the warnings; or the error. */
    status: () => element('status').textContent,
    isError: () => element('status').classList.contains('error'),
    /** The list on the left, as shown: the items the filter hides left out. */
    names: () => items().filter((item) => !item.hasAttribute('hidden')).map((item) => item.querySelector('.name')!.textContent),
    /** What the right side shows. */
    view: () => ({
      link: element('skill').querySelector('a')?.getAttribute('href'),
      copies: element('skill').querySelector('.copies')?.textContent,
      text: element('skill').querySelector('pre')?.textContent,
    }),
    selected: () => items().filter((item) => item.getAttribute('aria-selected') === 'true').map((item) => item.querySelector('.name')!.textContent),
    async scan(repo: string) {
      (element('repo') as unknown as { value: string }).value = repo;
      element('scan').dispatchEvent(new window.Event('submit', { cancelable: true }));
      for (let turn = 0; button.hasAttribute('disabled') || element('status').textContent === 'Scanning…'; turn++) {
        assert.ok(turn < 1000, 'the scan did not finish');
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    },
    filter(text: string) {
      (element('filter') as unknown as { value: string }).value = text;
      element('filter').dispatchEvent(new window.Event('input'));
    },
    select(name: string) {
      const item = items().find((item) => item.querySelector('.name')!.textContent === name);
      assert.ok(item, `no ${name} in the list`);
      item.dispatchEvent(new window.Event('click'));
    },
    /** The list's one Tab stop: the item with `tabindex="0"`; the others are `-1`. */
    tabStop: () => {
      assert.ok(items().every((item) => ['0', '-1'].includes(item.getAttribute('tabindex') ?? '')), 'every item focusable');
      return items().filter((item) => item.getAttribute('tabindex') === '0').map((item) => item.querySelector('.name')!.textContent);
    },
    /** Presses `key` on the list's Tab stop, or on the filter; true if the page handled it. */
    press(key: string, on: 'list' | 'filter' = 'list') {
      const target = on === 'filter' ? element('filter') : document.querySelector('#skills li[tabindex="0"]');
      assert.ok(target, 'nothing to press on');
      const event = Object.assign(new window.Event('keydown', { bubbles: true, cancelable: true }), { key });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    },
  };
}

test('the page: a repository field with the Scan button to its right, the list and the SKILL.md view', async () => {
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  const html = await response.text();
  assert.match(html, /<form id="scan">\s*<input id="repo"[^>]*>\s*<button type="submit">Scan<\/button>\s*<\/form>/);
  assert.match(html, /<input id="filter"[^>]*>\s*<ul id="skills"[^>]*><\/ul>\s*<\/div>\s*<section id="skill"/);
  assert.match(html, /import \{ start \} from '\.\/page\.js'/);
  const script = await fetch(`${url}page.js`);
  assert.match(script.headers.get('content-type') ?? '', /^text\/javascript/);
  assert.equal(await script.text(), readFileSync(new URL('../src/web/page.js', import.meta.url), 'utf8'));
});

test('the page, ./fixture: the skills by name on the left, the count and the warning above, nothing selected', async () => {
  const shown = await page();
  await shown.scan(FIXTURE);
  assert.deepEqual(shown.names(), ['code-style', 'commits', 'release-checklist', 'writing-lint-checks']);
  const [count, warning, ...rest] = shown.status().split('\n');
  assert.equal(count, 'fixture · 4 skills');
  assert.match(warning, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
  assert.deepEqual(rest, []);
  assert.equal(shown.isError(), false);
  assert.deepEqual(shown.selected(), []);
  assert.deepEqual(shown.view(), { link: undefined, copies: undefined, text: undefined });
});

test('the page: select a skill → its SKILL.md on the right, with the pinned link and its copies', async () => {
  const shown = await page();
  await shown.scan(FIXTURE);
  shown.select('commits');
  assert.deepEqual(shown.selected(), ['commits']);
  assert.deepEqual(shown.view(), {
    link: `${pathToFileURL(FIXTURE).href}/.agents/skills/commits/SKILL.md`,
    copies: 'also in .claude/skills/commits/SKILL.md',
    text: readFileSync(join(FIXTURE, '.agents/skills/commits/SKILL.md'), 'utf8'),
  });

  shown.select('code-style');
  assert.deepEqual(shown.selected(), ['code-style']);
  assert.deepEqual(shown.view(), {
    link: `${pathToFileURL(FIXTURE).href}/.github/skills/code-style/SKILL.md`,
    copies: undefined,
    text: readFileSync(join(FIXTURE, '.github/skills/code-style/SKILL.md'), 'utf8'),
  });
});

test('the page, keyboard: the list is one Tab stop; ↑/↓, Home/End move; Enter or Space selects', async () => {
  const shown = await page();
  await shown.scan(FIXTURE);
  assert.deepEqual(shown.tabStop(), ['code-style'], 'nothing selected → the first skill');
  assert.equal(shown.press('ArrowUp'), true);
  assert.deepEqual(shown.tabStop(), ['code-style'], 'already the first');
  shown.press('ArrowDown');
  assert.deepEqual(shown.tabStop(), ['commits']);
  assert.deepEqual(shown.selected(), [], 'moving does not select');
  assert.deepEqual(shown.view(), { link: undefined, copies: undefined, text: undefined });

  assert.equal(shown.press('Enter'), true);
  assert.deepEqual(shown.selected(), ['commits']);
  assert.deepEqual(shown.view(), {
    link: `${pathToFileURL(FIXTURE).href}/.agents/skills/commits/SKILL.md`,
    copies: 'also in .claude/skills/commits/SKILL.md',
    text: readFileSync(join(FIXTURE, '.agents/skills/commits/SKILL.md'), 'utf8'),
  });

  shown.press('End');
  assert.deepEqual(shown.tabStop(), ['writing-lint-checks']);
  shown.press('ArrowDown');
  assert.deepEqual(shown.tabStop(), ['writing-lint-checks'], 'already the last');
  assert.equal(shown.press(' '), true);
  assert.deepEqual(shown.selected(), ['writing-lint-checks']);
  assert.equal(shown.view().link, `${pathToFileURL(FIXTURE).href}/agent/skills/writing-lint-checks/SKILL.md`);
  shown.press('Home');
  assert.deepEqual(shown.tabStop(), ['code-style']);
  assert.equal(shown.press('a'), false, 'other keys left to the browser');

  shown.select('release-checklist');
  assert.deepEqual(shown.tabStop(), ['release-checklist'], 'a click moves the Tab stop too');
});

test('the page, keyboard: only the shown skills; ↓ in the filter goes to the first shown', async () => {
  const shown = await page();
  await shown.scan(FIXTURE);
  shown.select('release-checklist');
  shown.filter('commit');
  assert.deepEqual(shown.tabStop(), ['code-style'], 'the selected skill hidden → the first shown');
  shown.press('ArrowDown');
  assert.deepEqual(shown.tabStop(), ['commits']);
  shown.press('ArrowDown');
  assert.deepEqual(shown.tabStop(), ['commits'], 'release-checklist and writing-lint-checks are hidden');
  shown.press('Enter');
  assert.deepEqual(shown.selected(), ['commits']);

  shown.filter('lint');
  assert.equal(shown.press('ArrowDown', 'filter'), true);
  assert.deepEqual(shown.tabStop(), ['writing-lint-checks']);
  shown.press('Enter');
  assert.deepEqual(shown.selected(), ['writing-lint-checks']);
  shown.filter('');
  assert.deepEqual(shown.tabStop(), ['writing-lint-checks'], 'the selected skill shown → it');

  shown.filter('no such skill');
  assert.equal(shown.press('ArrowDown', 'filter'), false, 'nothing shown → the filter keeps the key');
});

test('the page: the filter above the list, by name or description, ignoring case and spaces', async () => {
  const shown = await page();
  await shown.scan(FIXTURE);
  shown.filter('lint');
  assert.deepEqual(shown.names(), ['writing-lint-checks']);
  shown.filter('commit');
  assert.deepEqual(shown.names(), ['code-style', 'commits'], 'commits by name, code-style by "committing" in its description');
  shown.filter('  KOTLIN ');
  assert.deepEqual(shown.names(), ['code-style']);
  shown.filter('no such skill');
  assert.deepEqual(shown.names(), []);
  assert.equal(shown.status().split('\n')[0], 'fixture · 4 skills');
  shown.filter('');
  assert.deepEqual(shown.names(), ['code-style', 'commits', 'release-checklist', 'writing-lint-checks']);
});

test('the page: the filter kept for the next scan; a selected skill filtered out stays on the right', async () => {
  const shown = await page();
  await shown.scan(FIXTURE);
  shown.select('commits');
  shown.filter('lint');
  assert.deepEqual(shown.names(), ['writing-lint-checks']);
  assert.deepEqual(shown.selected(), ['commits']);
  assert.equal(shown.view().link, `${pathToFileURL(FIXTURE).href}/.agents/skills/commits/SKILL.md`);

  await shown.scan(FIXTURE);
  assert.deepEqual(shown.names(), ['writing-lint-checks']);
  shown.filter('');
  assert.deepEqual(shown.names(), ['code-style', 'commits', 'release-checklist', 'writing-lint-checks']);
});

test('the page, GitHub: the link pins the scanned commit', async () => {
  const shown = await page();
  await shown.scan('https://github.com/JetBrains/example');
  assert.equal(shown.status(), 'JetBrains/example · 1 skill');
  shown.select('commits');
  assert.equal(shown.view().link, `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`);
});

test('the page: unreachable repository → the CLI message, no list; the previous scan cleared', async () => {
  const shown = await page();
  await shown.scan(FIXTURE);
  shown.select('commits');
  const missing = join(FIXTURE, 'no-such-directory');
  await shown.scan(missing);
  assert.equal(shown.status(), (await atlas(['scan', missing])).stderr);
  assert.equal(shown.isError(), true);
  assert.deepEqual(shown.names(), []);
  assert.deepEqual(shown.view(), { link: undefined, copies: undefined, text: undefined });
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

test('another Host than 127.0.0.1 or localhost on the port → 403, nothing scanned (DNS rebinding)', async () => {
  const { port } = new URL(url);
  const answer = (host: string, path: string) =>
    new Promise<{ status?: number; body: string }>((resolve, reject) => {
      get({ host: '127.0.0.1', port, path, headers: { host } }, (response) => {
        let body = '';
        response.setEncoding('utf8').on('data', (text) => (body += text));
        response.on('end', () => resolve({ status: response.statusCode, body }));
      }).on('error', reject);
    });
  const scan = `/api/scan?repo=${encodeURIComponent(FIXTURE)}`;
  for (const host of [`attacker.example:${port}`, '127.0.0.1:1', `127.0.0.1.attacker.example:${port}`]) {
    for (const path of [scan, '/']) {
      assert.deepEqual(await answer(host, path), { status: 403, body: JSON.stringify({ error: `Forbidden host: ${host}` }) });
    }
  }
  for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, `LOCALHOST:${port}`]) {
    assert.equal((await answer(host, scan)).status, 200, host);
  }
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

test('help and an unknown command list serve', async () => {
  const line = /^ {2}serve \[--port <port>\] +open the local web view \(the Node CLI only\)$/m;
  assert.match((await atlas(['help'])).stdout, line);
  assert.match((await atlas(['foo'])).stderr, line);
});

test('the browser terminal: serve is the Node CLI only', async () => {
  assert.equal(await createBrowserBackend().run('skill-atlas serve'), 'serve runs only in the Node CLI: ./skill-atlas serve');
});

test('./skill-atlas serve with a bad port → usage, exit code 1', async () => {
  const child = spawn(process.execPath, [CLI, 'serve', '--port', 'x'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (text) => (stderr += text));
  const code = await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(code, 1);
  assert.equal(stderr, 'Usage: skill-atlas serve [--port <port>]\n');
});
