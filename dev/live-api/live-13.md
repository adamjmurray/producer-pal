# Live 13 API changes

What Live 13 changes in the API, compared with 12.4.16. The surface diff was
taken on the 13.0b25 beta; everything else here was probed on 13.0b28. Live 13
is still in beta, so re-run `compare-python-max.ts` and `scan-live-api.ts` (see
[python-remote-script-api/](python-remote-script-api/README.md)) on each new
build and recheck the limits below.

Everything is reachable from both Max (the LOM) and Python unless it says
otherwise.

## What's new

- **`Clip.midi_clip_type`** (with a listener) says whether a MIDI clip is a
  notes clip or a step sequencer clip. Python reads the enum `Clip.MidiClipType`
  (`midi_notes`, `step_sequencer`); Max reads 0 or 1.
- **`RackDevice.max_num_chains`** reads 2 on a Mid-Side Rack, 3 on a Multiband
  Rack, and INT_MAX on every other rack. `insert_chain` throws at the max in
  Python; from Max it returns 1 and adds nothing.
- **`Track.clip_slots` on return tracks** is no longer empty. The slots hold
  envelope clips, a new clip type where `is_midi_clip` and `is_audio_clip` are
  both false. Max can read the clip but not its envelopes; Python can read and
  write them (see [clip-envelopes.md](clip-envelopes.md)).
- **Racks have 32 macro params**, with no change to the interface. The visible
  count steps 8, 10, 12, 14, 32 on add, and 32, 14, 12, and so on down to 2, 1
  on remove. See [rack-macro-mappings.md](rack-macro-mappings.md).
- **Round robin** is three ordinary parameters on instrument racks and MIDI
  effect racks, after Chain Selector: `Round Robin` (Off, On),
  `Round Robin Mode` (Forward, Backward, Other, Random) and `Round Robin Reset`
  (None, 1/4, 1/2, 1 Bar, 2 Bars, 4 Bars). All three take writes. With Round
  Robin off, the other two read `state` 1. Audio effect racks and drum racks
  have none.
- **New devices** (Drum Synth, Transient Shaper, Clipper, the fixed-chain racks,
  Softube) are ordinary devices and parameters. See
  [Live 13 devices](specialized-devices/live-13-devices.md).
- **`Application.ControlSurfaceProxy`** gains `view_state`, `view_device` and
  `request_view_state_change` (with listeners). They set what a control surface
  such as Push shows for a device. Python only.

Max's allowlist (`_MxDCore/LomTypes`) adds only `midi_clip_type` and
`max_num_chains`. On Live 12, Max answers a bare `1` for both (see
[python-remote-script-api/](python-remote-script-api/README.md)), so trust one
only from a real list read or after a version check.

## Limits as of 13.0b28

- **`midi_clip_type` is read-only**, so a clip can't be converted between notes
  and step sequencer.
- **A step sequencer clip can't be created**, only copied: `duplicate_clip_to`
  (same track or another MIDI track) and `duplicate_clip_to_arrangement` both
  make a copy that is still a step sequencer clip, from Max and Python alike.
- **A step sequencer clip's notes can't be read or written.** In Python,
  `get_notes_extended`, `add_new_notes` and `remove_notes_extended` each throw
  "Notes are only available in MIDI Note Clips". From Max they answer a bare `1`
  and no notes; Ableton's release notes say the Max console gets a warning, so
  nothing in the response says why. Before 13.0b27 these calls reached a
  separate note list instead: a write returned ids and a read returned those
  notes, but the steps never changed. Producer Pal decides by clip type without
  asking Live, so it keeps refusing note work until that code changes: recheck
  this on each release.
- **An envelope clip can't be created**, only copied. On a return track's slot,
  `create_clip` throws "MIDI clips can only be created on MIDI tracks" and
  `create_audio_clip` throws the audio equivalent; from Max both answer a bare
  `1` and make nothing. `duplicate_clip_to` from an existing envelope clip into
  an empty return slot works, on the same return track or another, from Max and
  Python alike.
