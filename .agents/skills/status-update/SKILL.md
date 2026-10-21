---
name: status-update
description: Summarize the recent activity in this repository since a given date and time (merged pull requests, resolved and new issues, open pull requests, commits to main, CI) and post the summary to the Slack channel #test566. Runs unattended, e.g. on a schedule.
---

# Status update
Runs without a human: don't ask questions, don't wait for confirmation. Only report; don't change code, issues or pull requests.

## 1. The period
1. **Since**: the date and time you were given, e.g. `2026-10-20 09:00 CET`. Convert it to UTC ISO 8601: `SINCE=2026-10-20T08:00:00Z`.
   If none was given, use the time of the last status update in #test566 (the latest message of yours ending with `status-update`);
   if there is none, the last 7 days.
2. **Until**: now, in UTC.
3. `git fetch origin` and use `origin/main`, not the local checkout.

## 2. Collect
Get the facts from GitHub; don't guess. `--limit 200` is enough for one period; if a list hits it, say so in the summary.
- **Merged pull requests**:
  `gh pr list --state merged --search "merged:>=$SINCE" --limit 200 --json number,title,url,author,mergedAt,labels,closingIssuesReferences`
- **Resolved issues**: closed as completed:
  `gh issue list --state closed --search "closed:>=$SINCE reason:completed" --limit 200 --json number,title,url,closedAt,labels`
  and closed without a fix (not planned, duplicate), counted separately:
  `gh issue list --state closed --search "closed:>=$SINCE -reason:completed" --limit 200 --json number,title,url,stateReason`
- **New issues**: `gh issue list --state all --search "created:>=$SINCE" --limit 200 --json number,title,url,author,labels,state,body`.
  Those whose body contains `<!-- red-agent -->` were filed by [red-agent](../red-agent/SKILL.md); those labelled `air-issue-to-pr` go to [issue-to-pr](../issue-to-pr/SKILL.md).
- **Open pull requests**: `gh pr list --state open --limit 200 --json number,title,url,author,isDraft,reviewDecision,createdAt,updatedAt`.
  Flag the ones waiting for a review, with changes requested, or not updated for over 3 days.
- **Commits to main** not in a merged pull request above: `git log origin/main --since="$SINCE" --no-merges --format='%h %an %s'`.
- **Spec changes**: `git log origin/main --since="$SINCE" --format='%h %s' -- spec/`, to say what behaviour changed, in the spec's words.
- **CI on main**: `gh run list --branch main --created ">=$SINCE" --limit 100 --json conclusion,status,displayTitle,url,createdAt`.
  The latest run's result; a failure that is still failing is the first thing in the summary.
- **Releases**: `gh release list --limit 20 --json tagName,name,publishedAt`, those published since `$SINCE`.
- **Demos**: PR comments with `<!-- feature-demo -->` on the merged and open pull requests, as a link next to the PR.

Leave out anything before `$SINCE`. A pull request and the issue it closes are one item: list the PR, with "closes #N".

## 3. Write the summary
Slack mrkdwn (`*bold*`, `<url|text>`, `•` bullets), short enough to read in a minute:
```
*Status update: <repository>, <since> – <until>* (UTC)
<1–2 sentences: what changed for users, and anything that needs attention>

*Needs attention*
• CI on main failing since <run link>
• <PR link>: waiting for review for 4 days

*Merged* (N)
• <PR link|#12 Filter the skill list> by @author, closes #10 · <demo link|demo>

*Resolved issues* (N) · M closed without a fix
• <issue link|#10 …>

*New issues* (N, K from red-agent)
• <issue link|#14 …> · open

*Open pull requests* (N)
• <PR link|#15 …> · draft / changes requested / approved

*Spec*: <what behaviour changed, one line each>
*Commits to main without a PR*: N · *Releases*: <tag> · *CI*: N runs, M failed
_status-update_
```
- Each item: a link, the title, one line. No item twice. Group by section, newest first.
- Omit an empty section, except **Merged**: "nothing merged" is news too. Omit *Needs attention* if nothing does.
- Nothing at all happened: post one line, "No activity in <repository> since <since>."
- Over 15 items in a section: the 10 most important (bugs and user-visible features first), then "and N more: <search link>".
- End with `_status-update_`, so the next run finds this message.

## 4. Post
Post the summary to **#test566** with the Slack tools available to you, as one message. Don't post twice: if a message of yours ending with `_status-update_` for the same period is already there, stop.
If it's over Slack's limit, post the overview and *Needs attention* as the message, and the sections as replies in its thread.

If you have no access to Slack, put the summary in the run's output and say that it wasn't posted.

## 5. Report
In the run's output: the period, the counts per section, and the link to the Slack message.
