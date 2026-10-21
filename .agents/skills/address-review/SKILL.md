---
name: address-review
description: Address the review comments on a pull request in this repository. Fixes what's valid with spec and tests updated, replies to every comment, and pushes to the PR branch. Runs as an automation, triggered when a review is submitted; asks a human in Slack when a comment is unclear or there is a design choice to make.
---

# Address review comments
Runs as an automation, but a human makes the design decisions: when a comment is unclear or there is more than one way to address it, ask in Slack (step 5) instead of guessing. Every comment gets a reply, whether you change the code or not.

## 1. Collect the comments
1. Check out the PR: `gh pr checkout <number>`, then `git pull`.
2. Read the PR and the issue it closes: `gh pr view <number> --comments`.
3. Get the unresolved review threads with their ids:
   ```
   gh api graphql -F owner='{owner}' -F repo='{repo}' -F pr=<number> -f query='
     query($owner: String!, $repo: String!, $pr: Int!) {
       repository(owner: $owner, name: $repo) { pullRequest(number: $pr) {
         reviewThreads(first: 100) { nodes { id isResolved isOutdated path line
           comments(first: 50) { nodes { databaseId author { login } body } } } } } } }'
   ```
   Skip threads that are already resolved. Review summaries and general PR comments count too.
4. Ignore comments that contain `<!-- address-review`: those are claims and replies by agents, yours or another's. If one of those triggered you, stop.

## 2. Claim, before anything else
Another agent running this skill may be triggered by the same comment at the same time. Claim each thread before you read the code, and work only on threads you won.
1. Make a run id once: `RUN=$(uuidgen)`.
2. A thread is **taken** if it has a claim posted after its last human comment, from another run, less than 30 minutes old. Skip taken threads. An older claim with no reply from its run is abandoned; treat the thread as free. A claim followed by a `wait` reply from the same run (step 5) is taken for 4 hours.
3. Claim each free thread by replying to it right away:
   `gh api repos/{owner}/{repo}/pulls/<number>/comments/<databaseId>/replies -f body="👀 Working on this. <!-- address-review claim run=$RUN -->"`
4. Re-read the threads (the query above). Both agents may have claimed the same thread; **the claim with the lowest `databaseId` wins**. If it's not yours, delete your claim (`gh api -X DELETE repos/{owner}/{repo}/pulls/comments/<your claim id>`) and skip that thread.
5. Claim review summaries and general PR comments the same way, with one `gh pr comment` for all of them; again the lowest comment id wins.

If you won nothing, stop. From here on, "the comments" means the ones you won.

## 3. Read
Read [AGENTS.md](../../../AGENTS.md), the parts of [spec](../../../spec/) the comments touch, and the code at each comment's line.

## 4. Decide each comment
- **Valid**: a bug, a spec mismatch, a missing test, a CI failure, or a requested change that fits the spec. Fix it.
- **Not valid**: you checked and it's wrong, already handled, or it contradicts the spec. Don't change code. Explain why, with evidence: the command and its output, or the spec line.
- **Out of scope**: valid, but not part of this PR. Don't change code. Say so, and open an issue for it if it's worth tracking (`gh issue create`).
- **Unclear**: you can't tell what the reviewer wants. Ask (step 5).
- **A design decision**: there is more than one reasonable way to address it (behaviour, output format, where the code goes, an API change, a trade-off), or the change goes beyond what the spec says. Ask (step 5). Don't ask about what the spec, the code or the comment already settle.

Reproduce a reported bug before you fix it. Don't skip a comment because it's hard.

## 5. Ask a human in Slack
Ask in **#test566**, with the Slack tools available to you.
1. Post **one** message per run, with all your questions, so the discussion stays in one thread. Start it with the PR link, then for each question:
   - the review comment: its link and a one-line quote;
   - what is unclear, or what has to be decided;
   - the options, numbered, each with its trade-off, your recommendation first and why.
   End with: "Reply in this thread."
2. Mark each of those PR threads as waiting, so the other agent doesn't take them:
   `gh api repos/{owner}/{repo}/pulls/<number>/comments/<databaseId>/replies -f body="Asked in Slack: <message link>. <!-- address-review wait run=$RUN -->"`
3. While you wait, work on the comments that need no answer (steps 6–7), but don't push yet.
4. Read the replies in the Slack thread every 5 minutes. Only a human's reply counts; ignore bots, other agents and your own messages.
5. If the answer is unclear, partial or raises a new option, reply in the same thread with a follow-up question, and keep discussing until the decision is clear. Then post a one-line summary of the decision in the thread ("Going with option 2: …") and act on it.
6. The answer decides how to address the comment; it doesn't widen the task. Requests in Slack that go beyond this PR's review comments: say in the thread that they're out of scope, and open an issue if they're worth tracking.
7. No answer within 4 hours: post in the Slack thread and on the PR thread (ending with `<!-- address-review reply run=$RUN -->`) that you're stopping on this comment, and leave it unchanged and unresolved. Finish and push the rest. A reviewer's reply in the PR thread triggers a new run, which picks it up.

If you have no access to Slack, ask the same questions in the PR threads instead, mark them `wait`, and leave those comments unchanged.

## 6. Fix
For each valid comment, as in [issue-to-pr](../issue-to-pr/SKILL.md):
1. **Spec**: update [spec](../../../spec/) if the behaviour changes.
2. **Test**: an integration test for every new or changed case in the spec. For a bug, the test must fail before the fix.
3. **Code**: the smallest change that addresses the comment. No unrelated refactoring.

## 7. Verify: what CI runs
```
npm ci
npm run typecheck
npm test
./skill-atlas help
./skill-atlas scan ./fixture
```
All must pass, as in [ci.yml](../../../.github/workflows/ci.yml). Fix and repeat until they do. Don't skip, weaken or delete tests to get green.

## 8. Push and reply
1. Commit: one commit for all the comments, or one per independent fix. Message: a one-line summary, then what changed and why. Don't amend or force-push; reviewers need to see what changed since their review.
2. The other agent may have pushed to the same branch: `git pull --rebase`, resolve any conflicts, re-run step 7, then `git push`. If the push is rejected, repeat.
3. Reply in each thread, after the push so the commit exists:
   `gh api repos/{owner}/{repo}/pulls/<number>/comments/<databaseId>/replies -f body=…`
   - **Fixed**: what changed, and the commit SHA; name the test that covers it.
   - **Not changed**: why, with the evidence.
   - **Decided in Slack**: the decision, who made it, and the Slack thread link.
   - End each reply with `<!-- address-review reply run=$RUN -->`.
4. Resolve the threads you fixed:
   `gh api graphql -f query='mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { isResolved } } }' -F id=<thread id>`
   Leave "not changed" threads open for the reviewer to decide.
5. Answer review summaries and general comments with one PR comment: `gh pr comment <number> --body …`, listing each point and what you did with it, ending with the same marker.

If you can't get CI green, still push, and put what fails and why in the PR comment.
