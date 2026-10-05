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

## Clip envelopes

Mechanics: [clip-envelopes.md](../../live-api/clip-envelopes.md).

`ppal-update-clip` `envelopes` writes one line at a time, each a call to the
remote script. A line it can't write is a `detail` on that clip's entry
(`envelope "<target>": <why>`), and the other lines still run.

- **A curve is spelled `~N`.** Points join with `/` (straight), `_` (hold, then
  jump) or `~N` (curved ramp, N from -1 to 1, no space after the `~`). A bare
  `~` or an amount outside -1..1 refuses the whole call before anything is
  written, with an example that works. A read prints `/`, `~N` (hundredths) or
  `_`; a curve that rounds to 0, or sits on a flat segment, prints `/`.

- **A write that fails partway leaves no half envelope.** The clear and the
  rewrite are one step: if Live throws while the points go in, the remote script
  removes what it wrote and the line's `detail` says the envelope was removed.

- **An unwarped audio clip takes no points.** Live keeps its envelopes but never
  plays them, so a line with points is refused:
  `not written: an unwarped audio clip can't play envelopes. Set warping: true on the clip, then write it again`.
  A clear line (nothing after the colon) still runs: removing an envelope that
  can't play does no harm. `warping` is read when the envelopes are applied,
  after the rest of the call, so a call that turns warping on writes and one
  that turns it off refuses.

- **Live before 12.4 takes no points.** Its Python API can't write envelope
  points, so a line with points is refused:
  `not written: writing envelope points requires Live 12.4 or later. An empty line still clears an envelope`.
  A clear line still runs.

- **A write re-enables overridden automation.** Moving an automated parameter by
  hand makes Live ignore its automation until Re-Enable Automation, so the new
  envelope wouldn't play. Every write re-enables the parameter, and when it had
  been overridden the clip's `detail` says so:
  `envelope "<target>": re-enabled its automation, which was overridden`. A
  parameter that wasn't overridden adds nothing.

Any clip read (`ppal-read-clip`, and the clips `ppal-read-track` and
`ppal-read-scene` list) adds `envs: true` to a session clip whose
`has_envelopes` is true, whatever `include` says. It follows Live's flag, so it
also covers envelopes `include: ["envelopes"]` can't read. Arrangement clips
never get it, and it is omitted otherwise.

`ppal-read-clip` `envelopes` lists each automated parameter. An envelope's
`detail` is a note about it: why `events` is absent, or, on an unwarped audio
clip, `doesn't play: the clip is unwarped. Turn warping on to hear it` beside
the events. One field, not two: both are plain text for the model about why the
envelope isn't what it looks like.

When the clip's `has_envelopes` is true but no automation was found, `envelopes`
is the string
`the clip has envelopes Producer Pal can't read (modulation, clip-level ones like Gain, or MIDI CC)`
instead of an empty list. Only that all-unreadable case is detectable; a clip
with both kinds lists the readable ones and says nothing of the rest.

## Converting an audio clip

Mechanics: [conversions.md](../../live-api/conversions.md).

`ppal-update-clip` `convert` (`drums`, `melody`, `harmony`, `simpler`,
`drum-rack`) makes a new track from an audio clip, through the remote script. It
runs last in the clip's turn, after the other edits and after `envelopes`, on
the clip those left. One conversion per clip: each clip's entry reports its own,
and one that fails doesn't stop the rest, except as noted below.

The entry gets
`converted: { track: { id, path }, clip?: { id, path, noteCount } }`. `clip` is
the MIDI clip of `drums`, `melody` and `harmony`, in the source's slot (Session)
or starting where it started (Arrangement); its `noteCount` can be 0, which is
an answer, not a failure. `simpler` and `drum-rack` make no clip.

- **Paths are read again at the end of the call.** The new track can land
  anywhere (a Simpler or Drum Rack track doesn't follow the source), and each
  conversion shifts the tracks after it. So once the call is done, every written
  entry's `path`, and the `path` of each `converted` track and clip, is read
  again. The param description says once that it adds a track; results don't
  warn.
- **Refused, so nothing changed**: not an audio clip, a take lane clip, a clip
  that is recording, one Live says isn't convertible, a Live without the
  conversions, no time left, or no remote script. With nothing else asked of the
  clip its entry is a skip; otherwise the entry stays and carries the reason in
  `detail`. Live's own message is passed on.
- **Live took the job but the result is unclear**: the entry stays, with a
  `detail`, never a throw. Live makes the track a moment after the route
  answers, so the call waits for a new regular track (up to 20 s, less when the
  request has less left). No track by then: the conversion was started, look for
  the track before converting again. Several new tracks (something else made
  one): none is reported as the clip's, and the detail names them. One track but
  no MIDI clip in the expected place: the track is reported with a `detail`.
- **After a conversion whose track wasn't found, or wasn't the only new one (or
  whose route went unanswered), the call's remaining conversions are skipped**,
  each as
  `not converted: an earlier conversion in this call didn't show its new track, so this one wasn't started; re-run it`.
  A late track would land in the next clip's comparison, and every clip would
  wait out the full 20 s.
- **`convert` with `arrangementSplit` or `split` is refused up front**: the
  split makes several clips and the conversion would have to pick one.
- **`convert` with a move (`toPath`, `toSlot`, `arrangementStart`) is refused up
  front**: the move changes where the clip is, and the conversion adds a track
  that shifts later paths. Move in one call, convert in the next.

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
