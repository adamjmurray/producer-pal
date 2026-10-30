# Clip envelopes

Part of [Clips, Playback and Sends](README.md).

Mechanics: [clip-envelopes.md](../../../live-api/clip-envelopes.md).

`ppal-update-clip` `envelopes` writes one line at a time, each a call to the
remote script. A line it can't write is a `detail` on that clip's entry
(`envelope "<target>": <why>`), and the other lines still run.

- **A line that stalls may still have landed; one Live skipped didn't.** When
  the route doesn't answer, or its connection is lost after the request went
  out, the line's `detail` says its points may still have landed (or that it may
  still have been cleared), and the lines after it aren't sent; so does running
  out of time before a line is sent. A line whose expiry ran out before Live
  started it changed nothing: its `detail` says so and the other lines still
  run.

- **A line too large for one Max message isn't sent.** Its `detail` gives the
  point count and roughly how many fit, and the other lines still run.

- **A remote script that goes missing mid-call keeps what landed.** With no line
  written yet, `envelopes` is the reason. After some were, `envelopes` counts
  them and a `detail` gives the reason, then `envelopes not written, re-run for`
  and the lines left. `ppal-read-clip` keeps the envelopes it read, and the rest
  say `not read: <reason>`.

- **A curve is spelled `~N`.** Points join with `/` (straight), `_` (hold, then
  jump) or `~N` (curved ramp, N from -1 to 1, no space after the `~`). A bare
  `~` or an amount outside -1..1 refuses the whole call before anything is
  written, with an example that works. A read prints `/`, `~N` (hundredths) or
  `_`; a curve that rounds to 0, or sits on a flat segment, prints `/`.

- **Times are read in each clip's meter.** Only the syntax (points, values,
  curves, connectors) is checked before anything is written. Points that run
  backwards in a clip's meter, or a third point at one time, are that line's
  `detail` on that clip, and the other lines still run.

- **A write that fails partway leaves no half envelope.** The clear and the
  rewrite are one step: if Live throws while the points go in, the remote script
  removes what it wrote, puts the old envelope back, and the line's `detail`
  says it was kept. With no old envelope it says nothing was written. If the old
  one can't be put back, `detail` says the old automation was lost.

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

## Hosted plug-in params

Mechanics: [plugin-hosting.md](../../../live-api/plugin-hosting.md). Builds with
hosted plug-ins on only; any other build refuses the spelling as an invalid
target.

A hosted plug-in's param is an `envelopes` target spelled as its wrapper's
device path plus its `h` id: `t3/d0/h206`, or `t3/d0/c1/d0/h206` inside a rack.
Live automates the wrapper's numbered slots ("Automation 001"...), so the line
is written to a slot's parameter, and the entry reports no slot unless it made
one. A target that can't be read (`t3/d0/hx`) refuses the call like any other.
The rest skip that line, as `envelope "<target>": <why>`, and the other lines
still run:

- **The wrapper must be on the clip's track**, reached by a path that clip
  automation can walk (devices and rack chains, not drum pads or return chains),
  and be a hosted plug-in. `h0` is no param id.
- **The slot** is the one already driving the param; else the lowest unmapped
  slot without arrangement automation; else a mapped slot whose automation is
  gone everywhere (no arrangement automation, no envelope in any clip on the
  track), which is remapped. A slot with automation is never remapped, and
  nothing is reclaimed while the track plays from Session, where automation
  can't be told. Each wrapper is asked once per call.
- **Mapping is reported.** A new mapping adds `mapped to slot "Automation 002"`
  to the entry's `detail`, and a reclaimed slot adds
  `(it drove "<param>", which had no automation left)`. If the write then fails,
  the line's reason ends `; already changed: mapped to slot "Automation 002"`.
- **No slot to take**:
  `all 128 automation slots of t3/d0 are in use. Delete the automation of one (a clip's envelope or the arrangement lane; ppal-read-device shows which params have a slot) to free it`.
  While the track plays from Session the reason says which are in use can't be
  told, and to stop its session clips.
- **The wrapper is still loading** (just after a Set opens or a track is
  duplicated): `the device is still loading; try again in a moment`, nothing
  mapped. A wrapper that is out of date, or doesn't answer, says so.
- **A clear** (`t3/d0/h206:`) clears the envelope on the slot driving the param.
  With no slot it does nothing and is no error: the line counts as written, with
  `there was no envelope to clear`. It never maps.
- **Two spellings of one param** (`h206`, `H206`) are the same parameter:
  nothing is written, as for any pair of lines on one parameter.

On a read, an envelope on a mapped slot names the plug-in's param:
`{ parameter: "Main Vol", id: "t3/d0/h206", slot: "Automation 002", ... }`, with
no `device` (the `id` has it), and `id` works as a write target. An envelope on
an unmapped slot, or on a device that isn't a hosted wrapper, reads as any
parameter (`parameter: "Automation 002"`, Live's `id`, `device`).

## Envelopes on an arrangement clip

Mechanics:
[arrangement-automation.md](../../../live-api/arrangement-automation.md).

An arrangement clip (MIDI or audio) has no envelopes of its own, so `envelopes`
writes the track's automation lane over exactly the clip's span, keeping the
clip. Every line goes into one scratch session clip as long as the clip, and one
stamp writes them all.

- **Times** run from where the clip starts (1|1), in the clip's meter, once
  across the whole span, however the clip loops. A point past the span's end is
  noted as it is on a session clip
  (`point 3|2 is past the clip end (3|1), so it never plays`).
- **The clip is re-created.** The entry carries the clip's **new id** and its
  path, and `envelopes` counts the lines written. The lane can't be read back,
  so nothing echoes it.
- **An empty line is refused**: nothing can clear a lane.
  `envelope "<target>": not cleared: an arrangement lane can't be cleared; write a flat line instead`.
  The other lines still run.
- **Nothing is changed unless a line was written.** When every line is refused
  (or the remote script is missing, stalls, is too old for points, or the
  request is out of time first), the entry says so (`envelopes` is 0, or the
  reason when the remote script is missing) and its `detail` ends
  `the clip and its lane are unchanged`. The clip is not parked. If the remote
  script goes missing after some lines landed, those are stamped and a `detail`
  names the rest.
- **Refused before anything is touched**, as the `envelopes` text: a clip on a
  take lane, a frozen track, an audio clip when the silence file isn't known.
- **Not beside an `arrangementLength` that tiles.** Lengthening a looped clip
  tiles it into new clips, and the lines would reach only the first, so the clip
  is skipped with nothing written:
  `not updated: arrangementLength tiles this looped clip into new clips, and envelopes would reach only the first. Send arrangementLength on its own, then envelopes in a separate call on the clips it returns`.
- **Failure after Live changed.** The clip is parked a bar past the Set's end
  while the lane is stamped, then copied back.
  - Parking fails: `envelopes: 0`,
    `not written: couldn't park the clip (<why>); it and the lane are unchanged`.
  - The stamp fails: the parked copy is deleted and the clip stays,
    `not written: couldn't write the lane (<why>); the clip is unchanged`.
  - Putting the clip back fails: the parked copy is kept. The entry names it
    (`id`, `path`) and says
    `couldn't put the clip back (<why>); already changed: the lane was written and the clip was replaced by an empty clip carrying the automation; its copy is parked at <path> (id <id>), so move it back`.
  - The parked copy or the scratch clip can't be deleted afterwards:
    `left a copy of the clip parked at <path> (id <id>): <why>; delete it`, or
    the scratch wording of the arrangement tools.

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
