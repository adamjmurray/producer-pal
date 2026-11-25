# Rules for every implementation task (read fully before starting)

You are implementing one Linear ticket in the Producer Pal repo. The
orchestrator (not you) reviews, runs Live/e2e, commits and pushes.

## Where you work

- Work ONLY in your assigned worktree (given in your task). Never cd into the
  main checkout (the repo root that holds `.claude/worktrees/`) itself, never
  switch branches anywhere, never stash, never push, never commit.
- First run `git -C <worktree> log --oneline -1` and
  `git -C <worktree> fetch -q origin && git -C <worktree> log --oneline -1 origin/dev`.
  If your HEAD isn't origin/dev (or the base the task names), stop and say so.
- `node_modules` is a symlink to the main checkout's. Never run
  `npm install`/`npm ci`/`npm update` unless your task says so (it would change
  everyone's dependencies).
- Generated parsers are already built. If you edit a `.peggy` grammar, run
  `npm run parser:build`. Never commit generated parsers (you don't commit
  anyway).

## Project rules

- Read `AGENTS.md` at the worktree root first. It's binding: license headers,
  naming, file-size limits, imports, null checks, Live API rules, warning
  capture, write pipeline, comment style ("How to Write").
- License header on a new file: `// Copyright (C) 2026 Adam Murray` and
  `// AI assistance: Claude (Anthropic)` (plain "Claude", never a model name).
  On an existing file, append to the end of the lists only if you're not already
  there.
- No Linear ticket ids (`AJM-NNN`) anywhere in the repo.
- Don't touch protected files listed in AGENTS.md (lint-suppression limits,
  comment limits, naming limits, coverage thresholds, jscpd threshold,
  dev/PRINCIPLES.md).
- Match surrounding code: comment density, naming, idiom. Keep comments short.
- Search docs instead of reading big ones (`grep -n -A15`). Read long files in
  ranges.

## Behavior and tests

- If you change how a tool answers (results, warnings, errors), update
  `dev/specs/tool-behavior/` and, if the model-facing guidance changed, the
  Skills in `src/skills/fragments/`.
- For a tool write path: if the write throws or times out after Live already
  changed, the result must still report what changed (landed entry with
  `detail`, never `ok:false` or a lone throw). Cover those paths with unit
  tests.
- Add unit tests for every behavior change. Function coverage must stay 100%
  (check `coverage/coverage-summary.txt` for files you touched).
- If the behavior touches Live, also add or extend an MCP e2e case in `e2e/mcp/`
  (see `e2e/mcp/README.md`), but DO NOT run e2e and don't open Live — the
  orchestrator runs it. Make sure it type-checks.
- Write any logs to a file name unique to your worktree (e.g.
  `scratchpad/<worktree-name>-check.log`); other agents share the scratchpad.
- Before reporting: `npm run fix`, then `npm run check` (capture the exit code;
  don't pipe it through tail). If you touched `webui/**`, also run
  `npm run ui:test`. Everything must pass. If `check` fails with a 5s timeout in
  a scan test, re-run it once; other agents may be loading the machine.

## When something is unclear

Don't ask and don't stop. Pick the conservative option that doesn't change how a
tool answers beyond what the ticket says, and list it under "Open questions" in
your report. If a part of the ticket truly needs a product decision, skip that
part and say so.

## Report (your final message)

- One-paragraph summary of the change.
- Files changed (paths).
- Tests added, and the exact `npm run check` result (pass/fail + exit code).
- Any e2e case you added and the command to run it.
- Proposed commit message: conventional-commit subject (`fix(scope): ...`,
  `perf(...)`, `refactor(...)`, `chore(...)`), plain-language body explaining
  why, no ticket ids. If it fixes a GitHub issue, say which.
- Open questions / things you skipped.
