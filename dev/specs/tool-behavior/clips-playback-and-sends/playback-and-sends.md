# Playback and sends

Part of [Clips, Playback and Sends](README.md).

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

## Synced launch

`play-session-clips-synced` and `ppal-create-clip` `auto: "play-clip-synced"`
start session clips at the next loop start of the clips already playing,
restarting nothing. How: `dev/live-api/launch-quantization.md`.

- **The reference is the playing, looping session clips on regular tracks other
  than the ones being fired**; with none, the fired tracks' own playing loops. A
  clip whose playhead is past its loop end isn't looping. The sync point is the
  next loop start of the longest.
- **Nothing to sync to fires plainly.** A stopped transport or no playing loop
  fires like `play-session-clips`, including its transport restart for two or
  more clips, and playback says `sync: "no loop playing to sync to"`.
- **Loops that don't all restart together at the longest loop's start are
  refused up front**
  (`... loop out of step ...; use play-session-clips to fire without sync`),
  before anything fires. That includes a loop whose length doesn't divide the
  longest's (3 beats against 8). create-clip still makes its clips and warns
  `auto ignored: …`, with the same text.
- **A loop start further off than the call can wait for is refused the same
  way**, but only when a wait is needed: the limit is the request deadline less
  5 s, or 30 s with no deadline. A fire that lands now goes ahead even with a
  deadline inside that margin.
- **A loop start on no usable launch grid fires plainly and says so**: `sync:`
  text in playback, a warning in create-clip. Grids no longer than the 0.15 s
  guard are not usable.
- **A call that has to wait answers late, once the clips are fired.** The wait
  ends as soon as a grid fits, when the transport stops, or at the limit above.
- **A call with no clip on a regular track to sync plans nothing.** All targets
  skipped: no `sync`, no wait, no refusal. Only group or return slots: they fire
  plainly with no wait, no per-slot `detail`, and
  `sync: "a group or return slot has no clip to sync"`. Beside a clip, such a
  slot's entry gets `detail: "fired without sync"`. A return slot always fires
  plainly.
- **One loop start per call.** The first clip fired, after any wait, fixes the
  loop start and its grid; every later clip aims at that same start, never at a
  later one. A first clip with no grid makes the whole call plain.
- **A slot that can't reach it fires plainly**: `detail: "fired without sync"`
  on its entry, and, when none synced, `sync: "nothing fired in sync"`.
  create-clip warns `auto: the loop start was missed; fired without sync`. That
  is a stopped transport, a wait that ran out, or, for a later clip, a start
  less than 30 ms ahead or a full grid length or more ahead (song time jumped
  back). The 0.15 s guard applies to the first clip only.
- **Success says when**: `sync: "starts in 2.2s, when t7/s1 loops"`, the time to
  the one loop start as of the first fire.
- **A synced launch restarts the transport for two or more clips only when it
  was stopped before the call**, as `play-session-clips` always does. It never
  restarts a transport that was playing.
- **The clip's `launch_quantization` is back as it was** when the call ends,
  even when the fire threw.

## Sends

`sends[].return` (and the deprecated `sendReturn`) take a return's id, name,
path (`rt0`, return tracks only) or letter prefix. The first hit wins, in that
order, and all but ids are case-insensitive:

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

A rack return chain can have no name. A read calls it `Return <n>`, so a write
takes that label too, matched whole and only when nothing above matched: a chain
really named `Return 1` wins.

`sends` is the one published way to set a send, on a track (update-track) and on
a chain or pad (update-device). `sendGainDb` + `sendReturn` is deprecated: still
honored, not published, and a call using it carries the deprecation warning,
which gives the `sends` call it means (built from the call's own values). A
comma list in `sendReturn` pairs one return per target, which `sends` can't do,
so that warning says to make one call per return. A call sending `sends` with
either of the pair is refused up front, whatever the values, before anything is
written. Half the pair is refused too.
