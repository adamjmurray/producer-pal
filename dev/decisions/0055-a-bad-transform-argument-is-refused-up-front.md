# ADR-0055: A bad transform argument is refused up front

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

**A mistake in the transform text that is the same in every meter is refused up
front**, once, before any clip is touched, the way an unparseable transform is:
a throw with a short message naming the function and what is wrong
(`ratchet() needs a count of 2 or more`). `ppal-create-clip`, `ppal-update-clip`
and `ppal-duplicate` all run the check where they parse the transform, in the
meter each clip will have.

**A constant that depends on the meter is judged per clip.** One call can target
clips with different time signatures, and a value built from a note value or bar
length is a different number in each (`1bar` is 4 beats in 4/4, 6 in 6/4). So a
constant argument that mixes `n/X` or `<count>bar` with other terms
(`repeat(n/8, 1bar - 4)`, `ratchet(n/16 - n/8)`, a `curve()` exponent of
`1bar - 4`) is refused only for the clips whose meter makes it bad: those get
`ok: false` and a `detail` on their own entry and are left as they were, and the
other clips go on. It is the same outcome as a `1|5-2|1` range that only some
meters can read. The call is still refused when every meter fails, and for a
clip that can't be undone (an arrangement clip being split, a duplicate onto the
arrangement). `ppal-create-clip`, `ppal-update-clip` and `ppal-duplicate` share
one rule for this.

A single `n/8` or `2bar`, alone or negated or scaled by a constant, has the same
sign in every meter. A bare one (a ratchet grid, a repeat offset) is always
above 0, and one at 0 or below (`-1bar`, `0 * n/8`) is bad everywhere, so those
stay up-front checks. A positive scaled one used as a count (`2 * n/8`) still
depends on the meter.

Refused:

- a duplicate selector on a line;
- a pitch name used as a value for anything but `pitch` (for audio, any pitch
  name as `gain` or `pitchShift`);
- a built-in function with the wrong number of arguments (`rand(0, 100, 50)`,
  `ramp(0)`);
- `ratchet`, `repeat`, `merge` or `split` with a missing or extra argument, a
  pitch name as a count, an offset that isn't a note value, a merge tolerance
  that isn't a note value or `0`;
- a constant argument with no note value or bar length in it that can't be
  evaluated, isn't finite, or is out of range (a ratchet count below 2 or grid
  of 0, a repeat offset of 0 or count below 1);
- a constant `curve()` exponent of 0 or less, on the same terms.

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
- **Refuse meter-dependent constants up front too.** Refuses clips that are
  fine: the same text is valid in a clip with another meter.

## Consequences

- A call that used to apply the rest of its lines now applies none of them (for
  a meter-dependent constant, none of them on the clips it is bad for).
- `ppal-create-clip` now handles a transform that only some positions' meters
  can read (a bar|beat range too) per position, as `ppal-update-clip` does; it
  used to refuse the whole call.
- The evaluators run the same checks, so no caller can apply an unchecked
  transform.
