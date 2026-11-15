---
name: comment-cleanup
description: >-
  Shorten and correct code comments in one directory of this repo, without
  losing load-bearing facts. Use when asked to clean up, tighten, or audit
  comments.
---

# Comment cleanup

Work one directory per session. Small batches are the only safety net: a rewrite
can drop a fact that matters, and no test catches it.

## Find the targets

```bash
npm run comment:stats            # worst offenders by longest block and comment lines
npm run comment:stats -- --all   # full per-file listing
```

Pick one directory. Note its current numbers before you start.

## The test for every comment

Ask, in order:

1. **Does it restate what the code does?** Delete it. The code already says it.
2. **Does it explain why, or warn against the obvious change?** Keep that part.
   An assumption that causes a bug if wrong, or a "don't do X, because Y", stays
   — say it in one or two sentences.
3. **Is it story?** History, alternatives rejected, measurements, ticket
   numbers, how it used to work. Cut it. If the reasoning is worth keeping and
   is not in an ADR yet, say so in your report instead of leaving it in the
   code.
4. **Does it still match the code?** Check every name, path, flag, and claim
   against the code and its tests before rewriting. Fix wrong claims; a wrong
   comment is worse than a long one. If you can't verify a claim, leave it and
   flag it.
5. **Does it stand on its own?** A comment must carry its reason. `(ADR-00NN)`
   after a complete thought is fine; "see ADR-00NN" instead of the reason is
   not. Never cite a principle by number.

Target: a comment shorter than the code it explains, in plain words.

## What not to touch

- License headers.
- Lint directives and their `-- reason`.
- JSDoc `@param`/`@returns` on exported functions (tighten wording, don't
  remove).
- Tool descriptions, skill fragments, and `.def.ts` text — those are user-facing
  and have their own review.

## Known rot to grep for

```bash
grep -rn "ADR-00" src scripts webui evals e2e   # numbered pointers that replaced a reason
grep -rn "Principle [0-9]\|P[0-9]\b" src         # principle numbers (numbering shifts)
grep -rn "TODO\|FIXME\|XXX" src                  # stale intentions
grep -rn "used to\|previously\|no longer\|legacy" src   # history
```

Also check names in comments against `git log --diff-filter=R` renames and
against the tool spellings retired by the addressing rework.

## Review before commit

Have a second pass (a reviewer agent or yourself, fresh) diff each rewritten
comment against the code it describes and answer one question: was a
load-bearing fact dropped or changed? Fix any hit.

Then:

```bash
npm run fix && npm run check
```

If a block in `LONG_BLOCK_ALLOWANCES` (`src/test/helpers/comment-limits.ts`) got
shorter, lower or drop its entry. Leave the density caps alone, and never raise
any cap.

Commit per directory. In the message, name the tree and say "comments only".
