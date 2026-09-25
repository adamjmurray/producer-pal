# Lists of Paths

How a comma-separated path list is carried out. Part of
[Object Paths](README.md).

A path param takes a comma-separated list (`paths` is accepted as a plural
spelling wherever `path` is).

**Every target named gets an entry, in the order named.** A target the call
couldn't carry out keeps its slot as `{ id | path, ok: false, reason }`, under
the param that named it and spelled as the caller wrote it — reads and writes
alike. `ok` is on skips only, and a skip is never also a warning. One target is
unwrapped and throws instead, having nothing to report. A target that needed no
work (a `delete` of something already gone) is not a skip: its normal entry
carries a `reason` and no `ok`. See
[ADR-0042](../../decisions/0042-a-skipped-target-keeps-its-slot.md).

**Creating tracks and scenes reads the list in the caller's coordinates.** Every
entry names a place in the Set as the caller read it, so `t+,t+,t+` appends
three tracks and `t2,t2` inserts two at 2, the second landing after the first.
An entry can move a new object an earlier entry already made, so each result
reports where that object ended up rather than the index Live was asked for.
`count` is the retired spelling of a repeated path, and is refused alongside a
list.

One shape is refused rather than half-applied:

- **A device list that reads through its own inserts.** Inserting a device
  renumbers the chain, so `path: "t0/d1,t0/d2"` would put both new devices at d1
  and d2 and push the originals past them — the second entry never lands where
  it was named. Refused before anything is created. Entries naming different
  chains are fine, and appending an audio effect renumbers nothing, so that
  stays allowed. Tracks and scenes have no such case: they sit in one flat list
  each, so the tool can work out every final position up front.
