---
name: ci-wait
description: >-
  Wait for CI on a pushed commit and report GREEN, RED, NOBUILD or STUCK. Use
  after every push to dev, before pushing the next commit.
---

# Wait for CI

```bash
.agents/skills/ci-wait/ci-wait.sh <sha>   # run in background
```

| Exit | Result  | Meaning                                               |
| ---- | ------- | ----------------------------------------------------- |
| 0    | GREEN   | every workflow run and check passed                   |
| 1    | RED     | a failure or a cancel (a cancelled run counts as RED) |
| 3    | NOBUILD | no workflow run appeared within 10 min of the push    |
| 4    | STUCK   | a run sat queued 20+ min with no jobs: a GitHub flake |

Polls workflow runs, check-runs and the commit status (`gh pr checks` and
`gh run list` both miss failures). A queued run has no check-runs yet, so all
three are needed. Waits up to ~1h.

A commit only gets a build while it is the head of an open, non-conflicting PR,
so push one commit at a time and wait for GREEN before the next. NOBUILD means
it wasn't (or the PR conflicts).

**STUCK** runs can't be cancelled or re-run, and the pre-push guard blocks the
next push while they sit queued. Recreate the commit with a new sha (same tree,
author, message and parent, signed: `git commit-tree -S`), force-push it with
`SKIP_DEV_PUSH_GUARD=1` and `--force-with-lease=refs/heads/dev:<old sha>`, and
wait again. Rebuild any local commits on top the same way.
