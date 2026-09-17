---
name: pr
description: Use when asked to create or update a pull request, including branch, title and description.
---

Load the `writing` skill and apply it to the title and description.

Before writing anything, check a few recently merged PRs in this repo (`gh pr list --state merged --limit 10`) and match their tone, length and structure.

Title: one terse imperative line, commit-message style.

Description: what changes for the user of the code, in a few short bullets or lines. No process narrative (test runs, review iterations), no history or commit archaeology - the "why" only when it changes a user decision.

Workflow:
- Continue on the current branch; if it is main, move the commits to a descriptively named branch first.
- Before proposing, run `git log --oneline <base>..HEAD` and confirm the PR would contain exactly this task's commits.
- Propose the exact title and description to the user; create or update the PR (`gh pr create` / `gh pr edit`) only after their explicit go-ahead.
- Do not push without the same explicit go-ahead.
