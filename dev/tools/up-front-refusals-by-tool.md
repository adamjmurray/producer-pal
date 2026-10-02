# Up-front refusals, tool by tool

Where each tool applies the refusal rules from
[ADR-0035](../decisions/0035-malformed-calls-are-refused-up-front.md). This list
follows the code; when it disagrees with a tool, the tool wins.

- **Rule 1's fourth bullet is where warn-and-skip had spread furthest.** Six
  conditions moved: the send pair in `updateTrack`/`updateDevice`, the tempo
  range in `updateScene`/`createScene`/`updateLiveSet`, `quantizePitch` in
  `updateClip`, `mappedPitch` in `updateDevice`, and the three malformed
  `params` entries in `updateDevice`/`createDevice`.
- **`updateTrack`, `updateScene` and `updateClip` refuse a call naming no
  target.** They warned and returned `[]`, which reads as "there was nothing to
  do" — every other tool already threw. They had applied their own warn-and-skip
  rule to a call with no items rather than to an item.
- **Three tools can't check their raw args.** update-clip's `id` and `path` name
  different clips and add up, so its target count is their sum and the two are
  never compared to each other. duplicate shares its destinations out across the
  sources before pairing, so the counts that have to agree are the per-source
  ones — its check runs where the copies are planned, still before any is made.
  create-clip's `arrangementStart` pairs with the path's tracks, not its clip
  slots, and one track takes every position — so its per-clip lists are checked
  against the clips its destinations make, once those are resolved — still
  before any clip is made. A call making one clip still compares the raw args,
  since a count of 1 is never a list and a trailing comma must still count.
