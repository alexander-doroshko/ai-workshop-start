---
name: issue-to-pr
description: Implement a GitHub issue (bug or feature) in this repository with the spec and integration tests updated, then open a pull request that closes it. Runs unattended, triggered when an issue is created.
---

# Issue to pull request
Runs without a human: don't ask questions, don't wait for confirmation. When something is unclear, choose the reading closest to [spec](../../../spec/) and say so in the PR.

## 1. Understand the issue
1. Read the issue: `gh issue view <number> --comments`.
2. Read [AGENTS.md](../../../AGENTS.md), all of [spec](../../../spec/), and the code and tests the issue touches.
3. Decide what it is:
   - **Bug**: the code doesn't do what the spec says. Reproduce it first: the exact command (e.g. `./skill-atlas scan ./fixture`) and the observed vs. expected output.
   - **Feature**: new or changed behaviour. The spec changes first.
4. Stop and comment on the issue instead of opening a PR (`gh issue comment <number> --body …`) only when you can't act on it: it's not reproducible, it contradicts the spec without saying the spec is wrong, it's a duplicate, or it's not about this repository. Say what you checked and what's needed.

## 2. Branch
`git switch main && git pull && git switch -c issue-<number>-<short-slug>`

## 3. Implement
1. **Spec**: update [spec](../../../spec/) so it describes the new behaviour; a bug that reveals an unspecified case gets that case added.
2. **Test first**: an integration test in [tests](../../../tests/) for every new or changed case in the spec, running the real command the way the existing tests do (`atlas([...])` in [helpers.ts](../../../tests/helpers.ts)); add to [fixture](../../../fixture/) if a case needs one. For a bug, the test must fail before the fix.
3. **Code**: the smallest change that makes the tests pass. Match the surrounding code; no unrelated refactoring.

## 4. Verify: what CI runs
```
npm ci
npm run typecheck
npm test
./skill-atlas help
./skill-atlas scan ./fixture
```
All must pass, as in [ci.yml](../../../.github/workflows/ci.yml). Fix and repeat until they do. Don't skip, weaken or delete tests to get green.

## 5. Open the PR
1. Commit: a one-line summary, then a short body on what changed and why.
2. `git push -u origin HEAD`
3. `gh pr create --base main --title "<summary>" --body …` with:
   - `Closes #<number>`
   - **What**: the change, in 1–3 sentences.
   - **Spec**: the cases added or changed, with links.
   - **Tests**: the new tests; for a bug, how it reproduced before the fix.
   - **Assumptions**: every judgment call you made where the issue was unclear, or "none".
   - **Verification**: the commands above, and that they passed.

If you can't get CI green, still open the PR, as a draft (`--draft`), with what fails and why in the description.
