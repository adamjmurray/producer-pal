# Clip envelopes

Part of [Clips, Playback and Sends](README.md).

Mechanics: [clip-envelopes.md](../../../live-api/clip-envelopes.md).

`ppal-update-clip` `envelopes` writes one line at a time, each a call to the
remote script. A line it can't write is a `detail` on that clip's entry
(`envelope "<target>": <why>`), and the other lines still run.

- **A target that isn't an id, a device path and param name, a mixer name or a
  hosted param refuses the call**, before anything is written. When it reads
  like MIDI controller data (`modwheel`, `Pitch Bend`, `CC1`), the refusal also
  says to add a CC Control device and use its param ids: that data has no
  envelope target of its own.
- **A device param is named by id, or by its device's path and its name**
  (`t0/d0/Filter Freq`). The leading `dN`/`cN` segments are the path and the
  rest is the name, matched as `ppal-update-device` matches one, so a name may
  hold a `/` or a `:` (`t0/d1/c0/d0/Dry/Wet`). A line splits at its last colon
  outside parentheses, since a display value can hold one (`(4.00 : 1)`). A name
  that matches two params on the device skips the line, naming their ids and
  ranges; so does a name that matches none. The name and the id of one param in
  one call are refused, as any two lines on one parameter are.
- **A point's value is raw, or what Live displays, in parentheses**
  (`1|1 (-6 dB)`, `(2 kHz)`, `(High-pass)`). A display value is read as
  `ppal-update-device` reads a param value and converted to raw before the line
  is sent; nothing is written to find it. A value the param can't take (wrong
  unit, unknown option) skips the line, saying why. One past the range writes
  the nearest end, as `ppal-update-device` does, and one note for the line names
  each: `envelope "pan": past the range, wrote (60R) as 50R, (70L) as 50L`. A
  bare raw value past the range is still refused. A point with both
  (`1|1 0.25 (112 Hz)`, as a read prints it) writes the raw value. A ramp stays
  straight in raw values. For a hosted plug-in's param the wrapper is asked: it
  moves the param to find each value and then puts it back, so the plug-in's
  sound can change for an instant, and a number between two values the param
  shows takes the nearest.
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

- **A point can repeat, and its value can be random.** `1|1x16@n/16 0.5` writes
  16 points a sixteenth apart; `rand(min, max)` in place of a value, or of a
  curve amount (`~rand(-0.5, 0.5)`), rolls one per point at write time, so each
  clip in a broadcast gets its own. The connector before a repeat arrives at
  each of its points; a repeat that starts the line holds. A malformed repeat or
  `rand()` refuses the whole call before anything is written. A repeat is at
  most 1000 points. A rolled value past the parameter's range is refused like
  any other, so a `rand()` range wider than the parameter's fails on some rolls
  and not others.

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

- **A line that looks spelled 0..1 on a wider parameter is noted.** Values are
  raw, and a 0..1 line is in range for a parameter that runs 0..127, so it
  writes and plays as a near-flat line. When the parameter's range spans 10 or
  more, it isn't stepped, every value written is within 0..1 and not all are 0,
  the clip's `detail` gives both:
  `envelope "<target>": values span 0..1 of the param's -64..64 range`. The line
  is still written. Any other write says nothing about the range.

## Hosted plug-in params

Mechanics: [plugin-hosting.md](../../../live-api/plugin-hosting.md).

A hosted plug-in's param is an `envelopes` target spelled as its wrapper's
device path plus its `h` id: `t3/d0/h206`, or `t3/d0/c1/d0/h206` inside a rack.
Live automates the wrapper's numbered slots ("Slot 001"...), so the line is
written to a slot's parameter, and the entry reports no slot unless it made one.
The plug-in's own name for the param works in place of the id (`t3/d0/Cutoff`,
matched exactly, else ignoring case); the wrapper numbers names the plug-in
repeats in its order ("Attack", "Attack (2)"), so the plain name is the first. A
name that still reaches several params (only once case is ignored) skips the
line, listing their ids; one the plug-in doesn't have is left to the wrapper's
own Live params ("Slot 001", "Device On"). A target that can't be read (`t3/hx`)
refuses the call like any other. The rest skip that line, as
`envelope "<target>": <why>`, and the other lines still run:

- **The wrapper must be on the clip's track**, reached by a path that clip
  automation can walk (devices and rack chains, not drum pads or return chains),
  and be a hosted plug-in. `h0` is no param id.
- **The slot** is the one already driving the param; else the lowest unmapped
  slot with no automation (no arrangement automation, no envelope in any clip on
  the track); else a mapped slot whose automation is gone everywhere, which is
  remapped. A slot with automation is never remapped. On a track that plays from
  Session, where arrangement automation reads as none, a free slot is still
  mapped, and only clip envelopes are checked; nothing is reclaimed there. Each
  wrapper is asked once per call, and only when the param has no slot.
- **The clips can't be checked** (no answer, no remote script, out of time):
  nothing is mapped, since a free slot might hold an envelope. The line skips
  with
  `no slot mapped, since the track's clips couldn't be checked for automation: <why>`;
  a missing remote script or an out-of-time call ends the clip's lines as it
  does for a write. Lines whose param already has a slot are unaffected.
- **Mapping is reported.** A new mapping adds `mapped to slot "Slot 002"` to the
  entry's `detail`, and a reclaimed slot adds
  `(it drove "<param>", which had no automation left)`. If the write then fails,
  the line's reason ends `; already changed: mapped to slot "Slot 002"`.
- **No slot to take**:
  `all 128 automation slots of t3/d0 are in use. Delete the automation of one (a clip's envelope or the arrangement lane; ppal-read-device shows which params have a slot) to free it`.
  While the track plays from Session the reason says which are in use can't be
  told, and to stop its session clips.
- **The wrapper is still loading** (just after a Set opens or a track is
  duplicated): `the device is still loading; try again in a moment`, nothing
  mapped. A wrapper that is out of date, or doesn't answer, says so.
- **No plug-in loaded**: the line skips with read-device's `detail` for the
  wrapper (the plug-in isn't installed, or there never was one), even for a
  param a slot drove, since the wrapper can't confirm its mapping.
- **A clear** (`t3/d0/h206:`) clears the envelope on the slot driving the param.
  With no slot it does nothing and is no error: the line counts as written, with
  `there was no envelope to clear`. It never maps.
- **Two spellings of one param** (`h206`, `H206`) are the same parameter:
  nothing is written, as for any pair of lines on one parameter.
- **Known limits.** A hosted line and a line naming the same slot's raw
  parameter id aren't caught as one parameter: both are written and the later
  wins.

On a read, an envelope on a mapped slot names the plug-in's param:
`{ parameter: "Main Vol", id: "t3/d0/h206", slot: "Slot 002", ... }`, with no
`device` (the `id` has it), and `id` works as a write target. Its points are raw
values with no display in parentheses: Live knows only the slot's own 0-1
number, and a write reads parentheses in the plug-in's units. An envelope on an
unmapped slot, or on a device that isn't a hosted wrapper, reads as any
parameter (`parameter: "Slot 002"`, Live's `id`, `device`).

## Envelopes on a return-track clip

Mechanics: [clip-envelopes.md](../../../live-api/clip-envelopes.md). Live 13.

A Live 13 return track's envelope clip (`rt1/s0`) reads and writes `envelopes`
exactly as a session clip on a regular track does: the same results, details and
partial-failure reports, with the remote script addressed `rt1` beside the slot.
Its parameters are the return track's own, named `rt1/d0` for devices, and a
target id must sit on that return track.

- **Targets.** The return's mixer (`volume`, `pan`, `send0`..; a send exists
  only if Live gives the return one), its devices and rack-chain devices by
  parameter id, and a hosted plug-in's param as `rt1/d0/h56`. Drum pads and
  devices in return chains stay out of reach, as on a regular track.
- **Only the clip's own track.** An id on another return track or a regular
  track is that line's `detail`:
  `id 473 is not on the clip's track (rt0), and a clip can only automate its own track`.
- **An empty envelope clip** reads `envelopes: []`, like an empty session clip;
  `envs: true` shows once it has one.
- **A copy or move** to a slot of another return track is Live's own duplicate:
  nothing is written for it, and the device envelopes aren't carried. The entry
  says so (see
  [Copies and moves to another track](#copies-and-moves-to-another-track)).
- **A remote script from before Live 13 return tracks** answers
  `the Producer Pal remote script in Live is a different build than this device's and can't do this; update it ...`
  for a return clip (a regular clip's envelopes work on it). Live 12 has no
  return-track clips, so `rt` paths are refused before any of this.

## Copies and moves to another track

Mechanics: [clip-envelopes.md](../../../live-api/clip-envelopes.md).

Live's clip copy onto another track never carries device-parameter envelopes;
volume, pan and send envelopes survive. When `ppal-duplicate` or
`ppal-update-clip` lands a clip on another track by Live's own copy, the
target's entry says what was dropped. A return track counts as a track.

- **A session clip** names the device envelopes, by Live's parameter name and
  the source device's path: `detail` reads
  `dropped the device envelopes, which don't copy to another track: Frequency (t0/d1), Macro 1 (t0/d0)`.
  A hosted plug-in's param is named as the plug-in names it. An envelope on a
  rack chain's own volume, pan or send is named with the chain's path
  (`Chain Volume (t0/d0/c1)`), since the rack stays behind. The track's own
  mixer envelopes are never listed. A clip with only those says nothing.
- **An arrangement clip** can't list them, so when `has_envelopes` is true its
  entry says
  `any device envelopes were dropped, since they don't copy to another track`.
  Without `has_envelopes` it says nothing.
- **Remote script missing**, or it can't list the clip: a session clip with
  envelopes gets the arrangement clip's wording instead of failing the write.
- **The same track** says nothing and doesn't read: the envelopes are listed
  only when the destination is another track and the clip has envelopes. A
  `ppal-duplicate` of one source to several slots lists it once.
- **The list is read before the copy**, since a move deletes the source, and
  waits no longer than a detail read does. Once a read stalls (no remote script,
  no answer, out of time), the rest of the call goes straight to the hedged
  wording. A failure building the note gives the hedged wording too, and never
  blocks the copy.
- **The note is on the entry only once the copy landed**, and stays on it when a
  later step throws. It comes after the entry's other notes about the copy (an
  overwrite, the lane write), the same in both tools.
- **A session clip copied to another track's arrangement**, at any length, says
  what Live wrote to the lane, then the session wording above: the lane gets the
  mixer envelopes and no device ones. On its own track it says only the lane
  write.
- **Paths that re-create the clip** (an arrangement clip moved or copied to a
  slot, or onto a take lane) already say `automation envelopes aren't copied`
  and add nothing.

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

`ppal-read-clip` `envelopes` lists each automated parameter. One on a rack
chain's own volume, pan or send has the chain's path as its `device`
(`t0/d0/c1`), and its `id` is a write target like any other. So is the chain's
path and the mixer name, `t0/d0/c1/volume` (`pan`, `send0`..), which needs no
id: no device read gives a chain mixer parameter's. The chain is spelled as any
tool takes one, a drum pad's layer (`t0/d0/pC1/c0/send0`) and a return chain
(`t0/d0/rc0/volume`) included. A path that reaches none is that line's `detail`:
`t0/d0/c1 has no send3`,
`envelopes target "t0/d0" resolves to device, not chain`, or the wording an id
on another track gets. A device inside a return chain stays out of reach, and so
does a chain of a rack inside one. An envelope's `detail` is a note about it:
why `events` is absent, or, on an unwarped audio clip,
`doesn't play: the clip is unwarped. Turn warping on to hear it` beside the
events. One field, not two: both are plain text for the model about why the
envelope isn't what it looks like.

When the clip's `has_envelopes` is true but no automation was found, `envelopes`
is the string
`the clip has envelopes Producer Pal can't read (modulation, clip-level ones like Gain, or MIDI CC)`
instead of an empty list. Only that all-unreadable case is detectable; a clip
with both kinds lists the readable ones and says nothing of the rest.
