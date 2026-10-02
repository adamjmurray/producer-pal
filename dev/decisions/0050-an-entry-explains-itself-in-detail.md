# ADR-0050: An entry explains itself in `detail`

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

**Every explanation on a result entry is `detail`**, whether the target was
skipped or not:

- a skip — `{ path: "t0/s3", ok: false, detail: "no clip at t0/s3" }`
- a no-op — `nothing to delete`
- a partial success — `moved, but arrangementLength didn't finish: …`
- a side effect — `overwrote the clip at t0[4|1]`
- a read-back — `gainDb, pan read back as shown, not as sent`

`ok: false` alone says the target failed. That holds for nested entries too
(sends, device params, device actions), and for `ppal-library`'s whole-call
explanation of an empty `items`. No tool result has a `reason` key.

## Alternatives rejected

- **Keep `reason` for both.** "Reason for what?" on every success.
- **`reason` on a skip, a second key otherwise.** Two keys for one job, and code
  that turns a partial success into a skip has to move the text between them.
- **`warning`.** That word already names the appended `WARNING:` block, and most
  details aren't problems.
- **`note`.** In a music tool it reads as a pitch: clip tools take and return
  `notes`, and drum pad reads already had a numeric `note`.

## Consequences

- One key, one meaning. `ok: false` is the only failure signal.
- A breaking change for scripts that read `reason` off any entry.
