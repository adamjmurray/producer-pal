---
name: agent-worktrees
description: >-
  Set up a git worktree for a parallel implementation subagent, brief it, and
  run e2e against its build. Use when delegating tickets to subagents that work
  in parallel.
---

# Agent worktrees

## Create one per agent

```bash
.agents/skills/agent-worktrees/mkwt.sh <name> [base]   # base defaults to origin/dev
```

Fetches, creates `.claude/worktrees/<name>` on branch `wt/<name>`, symlinks the
main checkout's `node_modules`, `webui/node_modules` and `.env`, and builds the
parsers. Never run `npm ci` in a worktree.

## Brief the agent

Start every implementation brief with the contents of
[brief-common.md](brief-common.md), then add the worktree path and the task.

## Run e2e against a worktree

```bash
.agents/skills/agent-worktrees/wt-e2e.sh <name> <marker> [--remote-script] <e2e filters...>
```

Live loads the device from the main checkout, so this builds the worktree and
copies its device files there first. `<marker>` is a string unique to the new
code; the script fails if it's missing from the copied build (pass `""` to
skip).

Ask before running: it opens Live Sets without saving and overwrites the device
build. Check nothing else is using Live (`ps` for e2e/evals). Afterwards run
`npm run build:debug` in the main checkout to restore dev's build.

## Clean up

```bash
git worktree remove .claude/worktrees/<name> && git branch -D wt/<name>
```
