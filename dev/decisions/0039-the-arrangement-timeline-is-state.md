# ADR-0039: The arrangement timeline is state, the playhead is not

- **Status:** Accepted
- **Date logged:** 2026-09-04

## Context

`ppal-playback` returned `currentTime`, the arrangement playhead. It was never a
read of the playhead. Every action overrode the value it read at the top of the
call, and `stop` returned a hardcoded `1|1` — so a call that stopped playback at
bar 5 answered bar 1, and the field agreed with `startTime` while disagreeing
with Live.

The optimism was there for a reason. Measured against a running Live, inside one
request:

```
[stop, stop, set start_time 32, start_playing, read] -> is_playing 0, current_song_time 0
1.2s later                                           -> is_playing 1, current_song_time 37.4
[stop_playing, read]                                 -> is_playing 1, current_song_time 37.39
0.6s later                                           -> is_playing 0, current_song_time 37.43
```

Live updates both properties asynchronously. A read in the same request as the
transport call answers the state from before it. Only a `sleep()` would see the
new one, and the V8 runtime has no clean way to wait that doesn't cost every
call the delay.

`start_time` — the arrangement start marker — has none of that. It reads back
synchronously and exactly, right after a write. And it answers the question a
caller actually has: `start_playing` always jumps to it, from stopped and while
already playing (measured: the playhead snapped from 23.19 back to 16.00).
Writing it while playing does not move the playhead.

## Decision

**`ppal-playback` does not report the playhead.** `currentTime` is gone.

**It reports `startTime`, read back off the Live Set**, whenever the call set
it, and on `play-arrangement`, which is governed by it: that's where playback
just began, and the caller may never have read it. Nothing else reports it,
because nothing else moves it.

**`play-arrangement` no longer resets the start position.** It used to write 0
whenever the caller named no `startTime`, which made the position unusable:
`update-arrangement` could set it, and the only thing that plays the arrangement
erased it before playing. Now it plays from wherever the position is, the way
Live's own Play button does, and reports where that was.

**`stop` keeps the start position instead of resetting it**, and takes a
`startTime` of its own to park where the next play begins. It used to write 0,
which made its reported position a constant `1|1` in any meter. Live moves the
position on its own — stopping an already-stopped transport is Live's second
press of stop, which sends both the playhead and the start position to the top —
so `stop` reads the position, stops, and writes it back. The position outlives
the transport: it stays where the caller put it until the caller moves it.

`playing` stays predicted rather than read, for the same asynchrony. It's a
certain outcome of the transport call, unlike a position.

## The loop goes with it

Two ends, one Live property pair (`loop_start` and `loop_length`), so the same
observability problem shows up in a different shape.

- **The loop is reported as `loop`, `loopStart` and `loopEnd`** — the names the
  schema publishes. It used to come back as `arrangementLoop: {start, end}`,
  three params renamed into words the caller could not have written, against
  principle 8.
- **It's reported when the call set it, and on `play-arrangement`**, which obeys
  it. A call that only moved the start position says nothing about the loop. A
  loop that's off and wasn't moved reports `loop: false` alone — bounds that do
  nothing aren't worth the tokens.
- **Naming either end turns the loop on.** Bounds with the loop off do nothing
  audible, so asking for a loop from bar 3 to bar 7 is asking for a loop. An
  explicit `loop: false` still wins, for setting bounds to use later.
- **One end alone slides the whole loop and keeps its length**, the way dragging
  the loop brace in Live does. Both ends set the span outright.
- **A loop that can't be had is refused whole**, leaving the on/off state alone.
  Writing the start and then refusing the length used to leave a loop nobody
  asked for: `loopStart 9|1, loopEnd 5|1` against a 3|1–7|1 loop wrote the
  start, refused the length, and produced a 9|1–13|1 loop with a warning that
  only mentioned the length.

## Consequences

- A caller can't ask Producer Pal where the playhead is. Nothing else reports it
  either. If that capability is wanted, it belongs in a pure read like
  `ppal-read-live-set`, where no transport call in the same request makes the
  value stale.
- Do not "fix" the missing playhead by adding a `sleep()` to `ppal-playback`.
  That trade was considered and rejected: it costs every call, and the value is
  moving anyway the moment playback is running.
- A caller who stops and plays again without naming a `startTime` resumes from
  the same start position, not from the top. Playing from the top is
  `startTime: "1|1"`, said out loud. The action description says so, because a
  model that assumes the old behavior would report the wrong bar.
- Principle 5 gained the rule this rests on: a property an operation moves on
  its own is not an untouched property, and is reported with the value read
  back.
