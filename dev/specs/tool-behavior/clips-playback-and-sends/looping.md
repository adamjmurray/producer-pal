# Looping and duplicateLoop

Part of [Clips, Playback and Sends](README.md).

## Looping

`looping` changes the loop flag and nothing else. `update-clip` restates the
region that was playing into the pair that `looping` newly selects, unless the
call gives `start`/`length` of its own.

Live keeps two regions per clip (the markers while looping is off, the loop
brace while it is on) and flipping the flag reveals whatever the other pair was
last left with. Live's own Loop button restores that remembered brace, but the
inactive pair can't be read through `ppal-read-clip`, so a model could not
predict it, report it, or restore it. Warning and letting the region jump costs
context on a common operation to report something the caller almost never
wanted. Mechanics: [clip-markers.md](../../../coding-standards/clip-markers.md).

## `duplicateLoop`

`duplicateLoop` doubles the loop region and copies its notes and automation
envelopes. `start` or `length` combined with `duplicateLoop: true` is refused
before anything runs, and the error names both correct spellings:

```
{ duplicateLoop: true }  double the whole clip, on its own
{ start, length }        select a region first, in a separate call
```

`firstStart` is region-neutral and still composes. `duplicateLoop` still reports
the length it landed on, since Live moved it on its own.

Why: `length` means the length you end up with everywhere else in the tool, but
combined with `duplicateLoop` it would mean the length you double from, so
`{length: "4bar", duplicateLoop: true}` on a 2-bar clip gives 8 bars. A param
that changes meaning with a sibling isn't learnable from prose: in an eval, 8 of
9 trials sent that call and got 8 bars, even with the order spelled out in the
schema. Doubling first and applying the region after makes the naive reading
right but the param useless (`length: "4bar"` after doubling a 2-bar clip is a
no-op). A warning arrives after the clip is already wrong. Two calls reproduce
every workflow exactly, including that `duplicate_loop` inserts rather than
overwrites. Refusing only `length` isn't enough: `start` moves the region too.

The order of the remedies in the error decides whether a model recovers. A model
reads the first one as the instruction, so the common case (double the whole
clip, on its own) goes first. Leading with "send two calls, length first" sent a
trial to the wrong region and took six calls to recover.
