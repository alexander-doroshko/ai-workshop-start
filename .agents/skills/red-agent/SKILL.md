---
name: red-agent
description: Test the web view of this repository against its spec, as a user would, and file one GitHub issue per bug found, with steps to reproduce and a video, labelled for the issue-to-pr automation. Runs unattended, e.g. on a schedule or after a push to main.
---

# Red agent: test the web view
Runs without a human: don't ask questions, don't wait for confirmation. Your job is to find where the
web view ([web.md](../../../spec/web.md)) doesn't do what the spec says, and to report each bug so that
[issue-to-pr](../issue-to-pr/SKILL.md) can fix it without asking anything. Don't fix the code yourself.

## 1. Read
1. `git switch main && git pull`, then `npm ci`.
2. Read [AGENTS.md](../../../AGENTS.md), all of [spec](../../../spec/) ([web.md](../../../spec/web.md) and the parts of
   [analysis.md](../../../spec/analysis.md) and [cli.md](../../../spec/cli.md) it refers to), and [fixture](../../../fixture/README.md).
3. Read the open issues, so you don't file a bug twice: `gh issue list --state open --limit 200 --json number,title,body,labels`.

## 2. Plan the tests
One check per statement in [web.md](../../../spec/web.md), each with the input that proves it and the expected result, in the spec's words. At least:
- **Serve**: `serve` on 4173 by default, `--port`, listed by `help`; a Host other than `127.0.0.1:<port>` or `localhost:<port>` → 403.
- **Scan**: the repository field with **Scan** to its right; `./fixture` and a public GitHub repository (with `GITHUB_TOKEN` if set)
  give the same skills as `./skill-atlas scan` on the same input, sorted by name, copies as one item.
- **Header**: the repository and the skill count above the list; the malformed front matter's warning under them, and the list still shown.
- **Select**: the SKILL.md on the right, the link pinned to the scanned commit, `also in <paths>` for copies.
- **Filter**: by name, by description, ignoring case and surrounding spaces; empty → all; no match → no items;
  kept for the next scan; a selected skill filtered out stays on the right.
- **Errors**: an unreachable repository, a missing directory, an empty field → the CLI's message, no list; then a good scan recovers.
- **API**: `GET /api/scan?repo=…` → `{ repository, skills, warnings }`, each skill with `link` and `text`; a failure → `{ error }`, status 400.

Then go past the happy path, as a curious user would: scan twice, scan a second repository after the first, switch
selection while filtering, Enter instead of the button, long or odd text (`<b>`, `%`, `"`, unicode) in both fields,
reload, a narrow window, keyboard only. Anything that breaks or contradicts the spec there is a bug too.

## 3. Run them
Start the server and drive the real page in headless Chromium with [demo.ts](../feature-demo/demo.ts), as in
[feature-demo](../feature-demo/SKILL.md#3-record):
```
RED=$(mktemp -d)
cp .agents/skills/feature-demo/demo.ts "$RED"/
(cd "$RED" && npm init -y >/dev/null && npm pkg set type=module && npm i playwright)
(cd "$RED" && npx playwright install --with-deps chromium || npx playwright install chromium)
./skill-atlas serve --port 0 > "$RED/serve.log" 2>&1 & echo $! > "$RED/serve.pid"
sleep 2; URL=$(grep -o 'http://[^ ]*' "$RED/serve.log")
```
Playwright stays out of [package.json](../../../package.json). Open `$URL` with `127.0.0.1`; run scripts from the repository root, so `./fixture` resolves.
Each shell call may be a new shell: keep `$RED` and `$URL` as literal paths.

- Explore with plain Playwright scripts (`$RED/explore.ts`): act, then read the page (`#skills li`, the status line, the right pane) and compare with the expected result.
  Wait for results instead of sleeping. Check the browser console and failed requests too.
- HTTP-level checks (Host, API, status codes) with `curl`, e.g. `curl -si -H 'Host: evil.com:<port>' "$URL"`.
- Compare with the CLI: `./skill-atlas scan <input>`.

A result is a **bug** only if it contradicts the spec, or it is plainly broken (an exception, a blank page, a hang,
unescaped HTML, lost input). Where the spec says nothing and the behaviour is reasonable, it's not a bug. Reproduce
each bug twice from a fresh page load before reporting it; drop what doesn't reproduce.

Group findings by cause: one bug = one wrong behaviour, even if several checks show it. Skip a bug an open issue already reports;
if you learned something new about it, add a comment to that issue instead.

## 4. Record each bug
A video per bug of the shortest steps that show it, from opening the page, with [demo.ts](../feature-demo/demo.ts)
(`$RED/<slug>.ts`, as in [feature-demo](../feature-demo/SKILL.md#3-record)):
- a `demo.caption` per step, and on the last one what's wrong: "Expected: … (web.md). Actual: …";
- a `demo.shot` at the moment the bug shows;
- `node "$RED/<slug>.ts" "$URL" "$RED/out/<slug>"` writes `<slug>.webm` and the screenshots.

Look at the screenshot: it must show the bug. For an HTTP-level bug with nothing on the page, record the page part
if there is one; otherwise the `curl` command and its output are the evidence.
When done: `kill $(cat "$RED/serve.pid")`.

## 5. Publish the videos
Videos don't go into `main`. They go on the `bugs` branch, one directory per bug:
```
git fetch origin bugs && git worktree add "$RED/bugs" origin/bugs -B bugs \
  || git worktree add --orphan -b bugs "$RED/bugs"
mkdir -p "$RED/bugs/<date>-<slug>" && cp "$RED"/out/<slug>/*.webm "$RED"/out/<slug>/*.png "$RED/bugs/<date>-<slug>/"
git -C "$RED/bugs" add . && git -C "$RED/bugs" commit -m "Red agent: <summary>"
git -C "$RED/bugs" push -u origin bugs
git worktree remove "$RED/bugs"
```
On a push rejection, `git -C "$RED/bugs" pull --rebase` and push again.

## 6. File an issue per bug
The label triggers [issue-to-pr](../issue-to-pr/SKILL.md), so the issue must be complete when it's created.
Once per run, make sure the label exists:
`gh label create air-issue-to-pr --description "Implemented by the issue-to-pr automation" --color d73a4a 2>/dev/null || true`.

Then, for each bug: `gh issue create --title "Web view: <what's wrong, in one line>" --label air-issue-to-pr --body …` with:
- **Spec**: the statement it breaks, quoted, with a link (e.g. [web.md](../../../spec/web.md#page)).
- **Steps**: numbered, from `./skill-atlas serve`, with the exact input (`./fixture`, the text typed, the key pressed).
- **Expected** vs. **Actual**: one line each.
- **Video**: `https://github.com/{owner}/{repo}/blob/bugs/<date>-<slug>/<slug>.webm`
- The screenshot inline: `![actual](https://github.com/{owner}/{repo}/blob/bugs/<date>-<slug>/<shot>.png?raw=true)`
- **Environment**: the commit tested (`git rev-parse HEAD`), Node version, headless Chromium.
- End with `<!-- red-agent -->`.

## 7. Report
In the run's output: the commit tested, the checks run and how many passed, and the issues filed (links), or "no bugs found".
