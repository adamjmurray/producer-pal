# Clips, Playback and Sends

Behavior that belongs to one domain. The rules every tool shares are in the
[README](README.md).

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
wanted. Mechanics: [clip-markers.md](../../coding-standards/clip-markers.md).

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

## Transform counts

`ppal-create-clip` and `ppal-update-clip` (transforms alone, or with `notes`)
report what the transforms did to the notes, by comparing each note before and
after:

- `transformed`: notes the transforms changed or made that are still in the
  clip.
- `deletedNotes`: notes the transforms removed (driven to 0, or merged into
  another). It pairs with `mutedNotes`; `deleted: true` on an entry means
  something else (another clip in the call moved onto it). Only notes the clip
  held count: pieces a `ratchet` made and then deleted don't, but the note they
  replaced does. A `merge()` keeps one note of each group it joins and deletes
  the rest; a short note swallowed by a longer one is deleted and the longer one
  counts as unchanged.
- A note a transform selected but left exactly as it was counts as neither
  (`velocity += 0`, a ratchet with no grid line to cut at, a split with no cut,
  `merge()` on a lone note). A `repeat` counts its copies, not the originals.
  Values are compared at 32-bit float resolution, the way Live stores them, so
  writing back the value a note already holds changes nothing.
- `transformed: 0` is reported when transforms ran and changed nothing: it is
  the caller's only sign that its selector matched nothing or its edit was a
  no-op. Only `deletedNotes` is left out at 0, and `transformed` is absent when
  no transform ran.
- `preTransforms` and `transforms` in one call count against how each note
  started: a note both changed counts once, and one that `transforms` puts back
  as it was counts as neither. With `duplicateLoop` the two passes re-read the
  clip around Live's double, so they can't share a starting point: each compares
  its own before and after, the report is their sum, and a note changed in both
  counts twice.

## Muted notes

No note notation can spell a muted note, so a muted note read back as an
ordinary one and the model took it for a note that plays. Muted notes (Live's
`mute` flag, "deactivated" in the UI) don't exist to the model:

- **Reads hide them.** `read-clip` leaves them out of `notes` and out of every
  count (`noteCount`, notes outside the region), so a count always matches what
  a read shows. It reports how many it hid as `mutedNotes`, only when there are
  some, so a clip of only muted notes isn't read as empty.
- **Edits treat them as absent and leave them in place.** Transforms don't
  select, change, delete or count them, and neighbor functions (`legato`,
  `note.index`, ...) skip them. Merges, transform-only updates and `code`
  rewrites write them back as they were. A transform-only update on a clip of
  only muted notes is ignored, and says so.
- **A note written at a muted note's pitch and start replaces it**: the model
  asked for a note there. A delete marker aimed at one is a no-op, since the
  note doesn't exist to it. A transform that moves a note there replaces it too,
  and the clip's entry says so in `detail` (with a count when several), since
  the model never asked for that note's slot.
- **Overlaps follow Live**: Live cuts whichever same-pitch note starts earlier
  at the next one's start, muted or not. After a note write the clip is read
  back (only when it has muted notes), and `detail` says when a muted note
  shortened a note, or a note shortened a muted one. A `code` rewrite is a note
  write too, so update-clip says the same of it (once, on the target's first
  clip when tiling made copies). A clip create-clip just made holds no muted
  notes, so its `code` has nothing to report.
- **Bar copy skips them**: they aren't in the source bar the model sees.
- **Copying a whole clip keeps them** (duplicate to a new place, take lanes);
  that isn't an edit of notes the model sees. Replacing, emptying or moving a
  clip carries or drops them with it.
- **Native Live operations act on them**, because Live does: `quantize` moves
  them and `duplicateLoop` copies them. The entry's `detail` says how many
  (`quantized 2 muted notes`, `duplicateLoop copied 1 muted note`). Quantize
  counts only the muted notes that moved, and on a clip of only muted notes that
  moved none it says so, so it never looks like nothing happened. A clip with no
  muted notes costs one note read for a quantize and one for a `duplicateLoop`.
- Clearing a clip (`preTransforms: "delete"`) leaves muted notes behind, so the
  read then shows an empty clip with `mutedNotes`.

Showing them with a marker was rejected: no notation can spell one, and a marker
spreads into every serializer and the Skills. Letting edits touch them would
change notes the model can't see and report counts that don't match a read.

## Playback and the arrangement timeline

Live updates `is_playing` and `current_song_time` asynchronously, so a read in
the same request as a transport call answers the state from before it. **Don't
add a `sleep()` to `ppal-playback` to fix that**: it costs every call the delay,
and the playhead is moving anyway once playback runs.

- **`ppal-playback` does not report the playhead.** Nothing does; if it is ever
  wanted, it belongs in a pure read like `ppal-read-live-set`, where no
  transport call makes the value stale. `playing` is predicted rather than read,
  since it is a certain outcome of the call.
- **`startTime` is the arrangement start marker**, read back off the Live Set.
  It reads back synchronously and exactly, and answers the question a caller
  has: `start_playing` always jumps to it. It is reported on `play-arrangement`,
  which it governs, and when the call set it to something other than the
  bar|beat written (a `loc:` name, or a position Live moved). Writing it while
  playing doesn't move the playhead.
- **`play-arrangement` plays from the start position wherever it is**, like
  Live's Play button, and reports where that was. It never resets it.
- **`stop` keeps the start position** and takes a `startTime` of its own to park
  where the next play begins. Live moves the position by itself (stopping an
  already-stopped transport sends both the playhead and the start position to
  the top), so `stop` reads the position, stops, and writes it back. A caller
  who stops and plays again resumes from the same place; playing from the top is
  `startTime: "1|1"`, said out loud.
- **The loop is `loop`, `loopStart` and `loopEnd`**, the names the schema
  publishes. It is reported only where the caller didn't say it: a
  `play-arrangement` that sets no loop reports the whole loop (bounds only when
  it is on); a call that sets the loop reports only the bounds the caller didn't
  name (the end that slid, or both after a bare `loop: true` on
  `play-arrangement`). A call that only moved the start position says nothing
  about the loop. Echoing back what the call set was dropped: `live_set loop`
  doesn't read back inside the request that wrote it, so the echo was one call
  behind.
- **Naming either end turns the loop on**, since bounds with the loop off do
  nothing audible. An explicit `loop: false` wins, to set bounds for later. One
  end alone slides the whole loop and keeps its length, like dragging the brace
  in Live; both ends set the span outright.
- **A loop that can't be had is refused whole**, leaving the on/off state alone.
  Writing the start and then refusing the length would leave a loop nobody asked
  for.

## Sends

`sendReturn` and `sends[].return` take a return's id, name, path (`rt0`, return
tracks only) or letter prefix. The first hit wins, in that order, and all but
ids are case-insensitive:

1. An id is exact and can't be shared. Only the ids of the returns being
   addressed count.
2. An exact name beats a path, because the name is what the user called it.
3. A path beats a prefix.
4. A prefix matches only before `-` or a space (`A` finds `A-Reverb`), and an
   exact name beats it: `Delay` finds `Delay`, not `Delay 2`.

When the value also fits another return, the winner is used and the send's own
entry says so in `detail` (`matched by id; "12" is also the name of "Delay"`),
even when the level landed. It never raises a `WARNING:`. A clash needs a return
whose name is another's id (digits) or an `rt<n>` path, which can only happen
past Z, where Live stops prefixing names with a send letter. The check guards
the order; a clash is not refused, because the order is deterministic.

Return tracks and rack return chains share one resolver. Chains have no path
form.
