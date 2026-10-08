# Arrangement Automation

What Producer Pal can do with a track's arrangement automation lanes, as
measured on Live 12.4.6 through the remote script. Not checked on Live 12.3.

Measure on a track with an instrument. On a MIDI track with no audio output, the
mixer volume's automation followed the clips instead: arrangement copies carried
it, and creating or deleting a clip cleared it.

## Summary

| Capability                      | Route                                     | Catch                     |
| ------------------------------- | ----------------------------------------- | ------------------------- |
| Which parameters have a lane    | `DeviceParameter.automation_state`        | only while in Arrangement |
| A lane's value at a time        | move the playhead, read `parameter.value` | values only, ~10 reads/s  |
| A lane's breakpoints and curves | saved `.als` only                         | as of the last save       |
| Write a lane over a span        | copy a session clip with envelopes        | replaces clips there      |
| Clear or remove a lane          | none                                      | —                         |

No Python object holds a track's automation lane. `Track`, `MixerDevice`,
`DeviceParameter` and `Song` have no envelope members, and an arrangement clip's
`automation_envelope(param)` is always None. Max's LOM allowlist has nothing
more (12.4.6 and 12.4.15b1 match).

## Writing: copy a session clip

`Track.duplicate_clip_to_arrangement(session_clip, time)` writes each of the
clip's automation envelopes into the track's lane. Over the copy's span:

- The lane takes the envelope's values for the part of the clip that's visible:
  from the loop start (or start marker) to the clip end. Points past the clip
  end are dropped.
- At the span's end, the lane steps back to what it was before: the old lane
  value, or the parameter's value when there was no automation. It doesn't hold
  the envelope's last value.
- A parameter the clip has no envelope for keeps its lane untouched.
- Outside the span, nothing changes.
- **The copy replaces any arrangement clips under the span**, splitting the ones
  that cross its edges. So carrying automation onto existing notes needs a
  carrier clip that holds the same notes.

Deleting the arrangement copy afterwards leaves the lane as written.

Warped audio clips behave like MIDI clips. An unwarped audio clip writes nothing
to the lane, matching its envelopes never playing.

**Other lengths.** A copy at the clip's own length does the above. At any other
`arrangementLength`, `ppal-duplicate` writes the lane itself, by stamping (see
[arrangement-operations.md](arrangement-operations.md#stamping-a-session-clips-automation)):
the lane gets the content the final copy will play, looping like playback, and
the clip is then placed from a copy with no envelopes. It skips the stamping for
a clip with no envelopes (`has_envelopes`) and for unwarped audio.

Copying an **arrangement** clip (or moving one, which Producer Pal does by copy
and delete) neither writes nor clears the lane: automation stays at the old
position. A clip re-created on a take lane carries no envelopes at all.

What carries: mixer volume, pan, sends, track activator, rack macros, and device
parameters inside racks. Chain mixer volume doesn't (and `ppal-update-clip`
already refuses chain and drum-pad parameters).

## Reading

**Which parameters are automated.** `automation_state` reads 1 when the
parameter has a lane, at any playhead position, and 2 when the user has
overridden it. It reads 0 while the track plays a session clip or is stopped in
Session (`Song.back_to_arranger` lit, `playing_slot_index` not -1). Session clip
automation also sets it while the clip plays. It's cheap.

**The value at a time.** With the transport stopped, set
`Song.current_song_time` and read `parameter.value` on a **later** request: the
value follows the lane, curves included. `sync_parameter_changes()` doesn't
help; the read lands on Live's next update tick, about 100 ms. So ~10 samples a
second per request loop, values only, no breakpoints. It moves the playhead,
can't pass `song_length` ("Cannot set the Songtime behind the Songlength"), and
reads the wrong thing while the parameter is overridden or the track is in
Session.

**Breakpoints.** The saved `.als` stores each lane as an `AutomationEnvelope`
keyed by the parameter's `AutomationTarget` id, with timed events and curve
controls. Not checked here. It reflects the last save only, and Producer Pal
can't trigger a save.

## Dead ends

- **Ableton's own remote scripts** read and write session clip envelopes only.
  Push's `AutomationComponent._can_edit_clip_envelope` refuses arrangement clips
  (`is_arrangement_clip`).
- **Live's undo file** (`Preferences/Ableton/Live x/Undo/0.band`) updates with
  every edit, but it's a binary undo log for crash recovery.
- **Menu commands.** No menu item deletes or clears automation. Edit → Delete
  needs a time selection, and Edit → Select Loop only makes one while Live is
  frontmost: driven from the background, Delete stays disabled.
- **Recording.** Arrangement automation recording writes in real time only, so a
  32-bar lane takes 32 bars of playback. Not tried.

## Probing

To sample a lane, have each `/probe` request read the value for the time the
previous request set, then set the next time, ~20 ms apart. See
[python-remote-script-api/](python-remote-script-api/README.md) for the probe
route.
