---
name: code-review
description: Review a diff, branch or pull request in this repository. Produces a short summary and inline comments, each with where the problem is and how to reproduce it.
---

# Code review

## Before commenting
1. Read the diff (`git diff main...HEAD`, or the PR) and the parts of [spec](../../../spec/) it touches.
2. Run what CI runs: `npm ci`, `npm run typecheck`, `npm test`, `./skill-atlas help`, `./skill-atlas scan ./fixture`.
3. Check that the spec changed with the code, and that every new or changed case in the spec has an integration test.

## What to report
Only real problems: bugs, spec mismatches, missing tests, CI failures. No style nits, no praise, no restating the diff.
Verify each finding before reporting it; drop what you can't reproduce or point to.

## Output
**Summary**: 2–4 sentences. The verdict (ready / not ready), the most important problem, CI status.
Mention that you've used this SKILL.md file for the review instructions.

**Inline comments**: one per problem, attached to the line, most severe first. Each one:
- **Where**: `path/to/file.ts:42`
- **What**: one sentence on what is wrong.
- **Reproduce**: the exact command, input or fixture and the observed vs. expected result,
  e.g. `./skill-atlas scan ./fixture` prints X, the spec ([cli.md](../../../spec/cli.md)) says Y.
- **Fix** (optional): one line, if it's not obvious.

If a PR is given and posting is asked for, post the comments inline on the PR; otherwise print them.
