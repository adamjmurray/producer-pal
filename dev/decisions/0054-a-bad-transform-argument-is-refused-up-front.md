# ADR-0054: A bad transform argument is refused up front

- **Status:** Accepted
- **Date logged:** 2026-09-30
- **Related:** [ADR-0035](0035-a-malformed-call-is-refused-up-front.md)

## Context

A syntax error in `transforms` is refused before any clip is touched. A mistake
in the transform text that parses (`ratchet(1)`, `velocity = C3`, two pitch
selectors on a line, `repeat()` with no offset) was warned instead, and that one
line was skipped. The text is the same for every clip, so a ten-clip call
repeated the same warning ten times, and the call returned results that looked
like success for a transform that did not do what was asked.

## Decision

**A mistake in the transform text that is the same for every clip is refused up
front**, once, before any clip is touched, the way an unparseable transform is:
a throw with a short message naming the function and what is wrong
(`ratchet() needs a count of 2 or more`). `ppal-create-clip`, `ppal-update-clip`
and `ppal-duplicate` all run the check where they parse the transform, in the
meter each clip will have.

Refused:

- a duplicate selector on a line;
- a pitch name used as a value for anything but `pitch` (for audio, any pitch
  name as `gain` or `pitchShift`);
- a built-in function with the wrong number of arguments (`rand(0, 100, 50)`,
  `ramp(0)`);
- `ratchet`, `repeat`, `merge` or `split` with a missing or extra argument, a
  pitch name as a count, an offset that isn't a note value, a merge tolerance
  that isn't a note value or `0`;
- a constant argument that can't be evaluated, isn't finite, or is out of range
  (a ratchet count below 2 or grid of 0, a repeat offset of 0 or count below 1);
- a constant `curve()` exponent of 0 or less.

**What stays as it is.** An argument that depends on the note or the clip (a
variable, `rand()`, `cos()`) can't be judged before the notes are, so it is
checked as the transform runs and reported on the clip. So are facts that only
exist per note or per clip: a ratchet that spans no grid line, `repeat`
collisions, `sync` on a session clip.

**A cap is reported, not refused.** `ratchet(500)` and `repeat(n/16, 100)` are
valid requests; the 64-piece cap is Producer Pal's, not a mistake in the text.
The clip's entry says it was clamped, so the caller learns the cap without
losing the call.

## Alternatives rejected

- **Keep warning and skipping.** One malformed line repeats per clip and leaves
  a result that reads as done.
- **Refuse note-dependent arguments too.** Not knowable up front; evaluating
  them early would need a note that doesn't exist yet.

## Consequences

- A call that used to apply the rest of its lines now applies none of them.
- The evaluators run the same checks, so no caller can apply an unchecked
  transform.
