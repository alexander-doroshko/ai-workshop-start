---
name: feature-demo
description: Record a short video demo of a web view feature in this repository, as a user would show it, from a pull request, issue or commit; publishes the video and screenshots and links them on the pull request. Runs unattended, e.g. triggered when a pull request is opened.
---

# Feature demo
Runs without a human: don't ask questions, don't wait for confirmation. The result is a video of the
feature in the real page ([web.md](../../../spec/web.md)), driven in headless Chromium by
[demo.ts](demo.ts): a visible cursor, typing at a readable pace, a caption for each step.
For a feature that is CLI only, don't record; say so on the PR and stop.

## 1. Understand the feature
1. Find the change: the PR (`gh pr view <number>`, `gh pr diff <number>`), the commit (`git show <sha>`),
   or the PR that closes the issue (`gh issue view <number>`). Check out its code: `gh pr checkout <number>` or `git switch --detach <sha>`.
2. Read [AGENTS.md](../../../AGENTS.md), the part of [spec](../../../spec/) the change touches, and the integration tests it added (e.g. [web.test.ts](../../../tests/web.test.ts)).
   Each new or changed spec case is one scene of the demo; the tests show which inputs prove it.
3. Choose the repository to scan: [fixture](../../../fixture/README.md) (`./fixture`, offline, the tests' data) unless the feature needs
   more skills than it has; then a public GitHub repository with enough of them (set `GITHUB_TOKEN`).

## 2. Write the scenario
A script of scenes, about 15–40 seconds in all: before the feature, then each case, then the way back.
For example, the list filter ([b87abbe](https://github.com/alexander-doroshko/ai-workshop-start/commit/b87abbe)):
scan → type `commit` → the list narrows → backspace → select a skill → filter it out, it stays on the right → clear → all skills.
- Act through the page as a user does: `demo.type`, `demo.click`, `demo.press`; `demo.page` (Playwright) only to wait or read.
- A `demo.caption` per scene, in the spec's words; `demo.shot` at the moment each case shows.
- Wait for results instead of sleeping: `await demo.page.locator('#skills li').first().waitFor()` after a scan.

## 3. Record
```
DEMO=$(mktemp -d)
cp .agents/skills/feature-demo/demo.ts "$DEMO"/
(cd "$DEMO" && npm init -y >/dev/null && npm pkg set type=module && npm i playwright)
(cd "$DEMO" && npx playwright install --with-deps chromium || npx playwright install chromium)
npm ci
./skill-atlas serve --port 0 > "$DEMO/serve.log" 2>&1 & echo $! > "$DEMO/serve.pid"
sleep 2; URL=$(grep -o 'http://[^ ]*' "$DEMO/serve.log")
```
Playwright stays out of [package.json](../../../package.json). Open `$URL` as printed, with `127.0.0.1`: other hosts get 403.
Write the scenario to `$DEMO/scenario.ts`:
```ts
import { record } from './demo.ts';
const [url, out] = process.argv.slice(2);
await record({ url, out, name: '<slug>' }, async (demo) => {
  await demo.caption('Scan a repository');
  await demo.page.fill('#repo', '');
  await demo.type('#repo', './fixture');
  await demo.click('button[type=submit]');
  await demo.page.locator('#skills li').first().waitFor();
  // the scenes of step 2
});
```
Run it from the repository root, so `./fixture` resolves for the server: `node "$DEMO/scenario.ts" "$URL" "$DEMO/out"`.
It writes `$DEMO/out/<slug>.webm` and the screenshots. Then stop the server: `kill $(cat "$DEMO/serve.pid")`.
Each shell call may be a new shell: keep `$DEMO` and `$URL` as literal paths, not variables you rely on.

## 4. Check it
Look at every screenshot. Each must show its case as the spec says: the right items, the caption, no error in the status line.
If one doesn't, fix the scenario and record again; if the page itself is wrong, that is a bug: say so on the PR, with the screenshot, and don't publish the demo.

## 5. Publish
Videos don't go into the PR's diff. They go on the `demos` branch, one directory per PR:
```
git fetch origin demos && git worktree add "$DEMO/demos" origin/demos -B demos \
  || git worktree add --orphan -b demos "$DEMO/demos"
mkdir -p "$DEMO/demos/pr-<number>" && cp "$DEMO"/out/*.webm "$DEMO"/out/*.png "$DEMO/demos/pr-<number>/"
git -C "$DEMO/demos" add . && git -C "$DEMO/demos" commit -m "Demo for #<number>: <summary>"
git -C "$DEMO/demos" push -u origin demos
git worktree remove "$DEMO/demos"
```
On a push rejection, `git -C "$DEMO/demos" pull --rebase` and push again. Then one PR comment (`gh pr comment <number> --body …`):
- **Demo**: a link to the video, `https://github.com/{owner}/{repo}/blob/demos/pr-<number>/<slug>.webm`
- Each screenshot inline, `![<case>](https://github.com/{owner}/{repo}/blob/demos/pr-<number>/<shot>.png?raw=true)`, under the spec case it shows
- **Scenario**: the scenes in one line each, and the repository scanned
- End with `<!-- feature-demo -->`; if an earlier comment has it, edit that one instead: `gh api -X PATCH repos/{owner}/{repo}/issues/comments/<id> -f body=…`

Without a PR (a commit only), publish to `demos/<sha>/` and put the links in the run's output.
