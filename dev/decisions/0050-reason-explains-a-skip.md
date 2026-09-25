# ADR-0050: `reason` explains a skip; everything else is a `note`

- **Status:** Accepted
- **Date logged:** 2026-09-24
- **Amends:** [ADR-0042](0042-a-skipped-target-keeps-its-slot.md),
  [ADR-0044](0044-write-results-report-only-what-changed.md),
  [ADR-0047](0047-an-arrangement-write-overwrites-and-says-so.md)

## Context

A result entry used `reason` for two different things: why a target was skipped
(`ok: false`), and anything else worth saying about a target that worked — a
no-op, a partial success, a side effect, a value read back differently than
sent. On a success, `reason` makes a reader ask "reason for what?".

## Decision

**`reason` appears only beside `ok: false`.** It says why that target was
skipped.

**Every other explanation on a result entry is `note`:**

- a no-op — `nothing to delete`
- a partial success — `moved, but arrangementLength didn't finish: …`
- a side effect — `overwrote the clip at t0[4|1]`
- a read-back — `gainDb, pan read back as shown, not as sent`

That holds for nested entries too (sends, device params), and for
`ppal-library`'s whole-call explanation of an empty `items`.

## Alternatives rejected

- **Keep `reason` for both.** A caller can't tell from the key whether the
  target failed; only `ok: false` beside it says so.
- **`warning`.** That word already names the appended `WARNING:` block, and most
  notes aren't problems.

## Consequences

- One key, one meaning: a caller that sees `reason` knows the target failed.
- A breaking change for scripts that read `reason` off an entry that worked.
