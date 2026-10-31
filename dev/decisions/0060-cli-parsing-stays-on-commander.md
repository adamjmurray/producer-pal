# ADR-0060: CLI parsing stays on commander

- **Status:** Accepted
- **Date logged:** 2026-10-31

## Decision

The eval, chat, report and probe CLIs keep parsing their arguments with
`commander`. Node's built-in `util.parseArgs()` has no help text, no
space-separated variadic values, no options with an optional value (`-m` with or
without a model), and no `--no-x` flags. All four CLIs use some of these.

## Rejected

- **Porting to `util.parseArgs()` with a small shared helper.** It was built and
  passed every check, but rebuilding what commander does took about three files
  of our own parsing and help code, a spec per CLI, and gave slightly worse
  errors (no "did you mean", stricter on dash-leading values). The only gain was
  argument parsing as a pure, unit-testable function. Owning that code to drop
  one stable dev dependency isn't worth it.
