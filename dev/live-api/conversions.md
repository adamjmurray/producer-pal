# Audio Clip Conversions

`Live.Conversions` is what Push's Convert button and Live's "Convert ... to New
MIDI Track" menu use. Max for Live can't call it, so `update-clip`'s `convert`
goes through the remote script (`remote-script/Producer_Pal/conversions.py`).
Measured on Live 12.4.6; not checked on 12.3, the minimum version.

| Call                                           | Makes                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `audio_to_midi_clip(song, clip, type)`         | a MIDI track with a MIDI clip: `harmony_to_midi` 0, `melody_to_midi` 1, `drums_to_midi` 2 |
| `create_midi_track_with_simpler(song, clip)`   | a MIDI track with a Simpler (classic mode, warp off) holding the sample; no clip          |
| `create_drum_rack_from_audio_clip(song, clip)` | a track with a Drum Rack, a Simpler on pad C1 (36); no clip                               |

`update-clip` doesn't expose the last two. They load the same sample file
(nothing is rendered, so clip and track automation isn't baked in), drop the
clip's warp, and carry over only the clip's gain (the Simpler gets it) and name.
`create-device` with a Simpler `sample` param, or a Drum Rack `pC1/sample`
param, does the same and more.

What `audio_to_midi_clip` loads on the new track (Live 12.4.6): one device,
named for the conversion. `drums_to_midi` gets a Drum Rack ("Drums to MIDI"),
`melody_to_midi` and `harmony_to_midi` an Instrument Rack holding an Analog and
an Electric ("Melody to MIDI", "Harmony to MIDI"). The track is named like
"7-Drums to MIDI".

## It returns before it works

Every call returns `None` at once and does the work on Live's main thread on a
following tick, blocking Live for about 0.6 to 0.8 s (a 1.6-beat clip and an
8-bar loop with 108 notes both took about 0.8 s). Right after the call there is
no new track. A request sent then is held until the conversion finishes, but a
caller shouldn't rely on that: poll for the track with a deadline.

## Where the result lands

- **The new track's position isn't predictable.** The audio-to-MIDI calls put it
  right after the source track; the Simpler and Drum Rack ones land elsewhere.
  Find it by diffing the track list from before.
- A Session clip makes its MIDI clip in the **same slot** of the new track. An
  Arrangement clip makes one at the **same start and end time**. Its length can
  differ a little from the source's.
- A kick converted as melody gave 0 notes: valid, not a failure.
- A clip that is playing converts fine: the source keeps playing, and the new
  MIDI clip arrives stopped. Push calls `track.stop_all_clips()` first; we
  don't.

## Errors

- A MIDI clip raises `RuntimeError('Cannot convert MIDI clip.')`, and an invalid
  type `RuntimeError('Invalid algorithm.')`.
- `is_convertible_to_midi(song, clip)` answers for audio clips and **raises for
  MIDI clips**: check `is_audio_clip` first.
- Push also checks the clip isn't recording. We refuse a recording clip.

Not probed: unwarped audio clips, a clip with no sample, frozen tracks, and
where the track lands for a source inside a group.

## Sliced Simpler to Drum Rack

`sliced_simpler_to_drum_rack(song, simpler)` backs `update-device`'s
`sliceToDrumRack` action, through the remote script's
`/device/simpler/to-drum-rack`. Measured on Live 12.4.16 with 1-bar and 8-bar
drum loops.

- **It works at once**, unlike the clip conversions: the Drum Rack is there
  before the call returns.
- **It replaces the Simpler in place.** Same track, same device position, no new
  track. The rack is a new device that keeps the Simpler's name; the track name
  doesn't change. A Simpler on a drum pad or in a rack chain converts in place
  too, leaving a Drum Rack inside that chain.
- **One pad per slice, from C1 (36) up**, named "Slice 1", "Slice 2", … Each
  pad's chain holds one Simpler in one-shot mode on the same sample file, with
  its start and end markers at the slice's bounds, and the sample's warp setting
  kept. Every chain is in choke group 1. Simpler allows at most 64 slices, so
  the pads never run out.
- **MIDI clips on the track are untouched**, and their notes still play the same
  slices: Simpler plays slice N from C1 up too.
- A Simpler that isn't in slicing mode raises
  `RuntimeError('Can only convert to drum rack if sliced')`.
- **Never replace the sample and convert in the same main-thread call: Live
  crashes** (null pointer, three out of three tries). `replace_sample` in one
  request and the conversion in the next is fine, even with no wait between
  them. Setting slicing mode or the slice settings in the same call as the
  conversion is also fine. So the route never loads a sample, and
  `update-device` loads the sample through Max before it asks for the
  conversion; an e2e test does both in one tool call.

Not probed: undo steps and Live 12.3.

## Track devices to a Drum Rack pad

`move_devices_on_track_to_new_drum_rack_pad(song, track_index)` takes an index
into `song.tracks`. It backs `update-track`'s `convert: "drum-rack"`, through
the remote script's `/track/to-drum-rack`. Measured on Live 12.4.16.

- **It works at once** and returns the new `DrumPad` (C1, note 36).
- **It makes a new track** holding a Drum Rack, with the source's whole device
  chain on pad C1. The pad is named after the first device. Clips aren't copied.
  An audio track works too: its effects land on the pad with no instrument.
- **The new track lands right after the selected track**, not after the source,
  and inside a group when the selected track is in one. Live then selects and
  arms it, which disarms the others under exclusive arm. Selecting a track in
  the same call as the conversion is fine, so the route selects the source and
  the new track lands right after it.
- **A source with clips is kept; a source with none is deleted.** With a session
  or arrangement clip, the source keeps its devices and the new track is named
  "N-Drum Rack". With no clips at all, the source track is gone and the new
  track takes its name.
- **Live crashes when the deleted source is its group's only child** (null
  pointer, three out of three tries). A clip-less grouped track with siblings is
  fine, and so is an only child that has a clip. The route refuses that case
  before calling.
- A track whose first device is already a Drum Rack nests: the new rack holds
  the old one on pad C1.
- A track with no devices, or a group track, does nothing and returns `None`. An
  index out of range raises `RuntimeError('Track index out of range.')`.

## Drum pad to a MIDI track

`create_midi_track_from_drum_pad(song, drum_pad)` backs `duplicate` of a drum
pad with `toPath: "t+"`, through the remote script's
`/device/drum-pad/to-track`. Measured on Live 12.4.16.

- **It works at once** and returns `None`.
- **It makes a new MIDI track with a copy of the pad's chain**, named after the
  pad. The pad keeps its chain. No clips or notes are copied, even when the
  rack's track has clips that play the pad.
- **The new track lands right after the selected track**, and Live selects and
  arms it. The route selects the last track first, so `t+` appends.
- An empty pad does nothing and raises nothing.
- A Drum Rack nested in another has no `drum_pads` of its own, so only the outer
  rack's pads can be converted. An outer pad holding a Drum Rack gave a track
  with the inner pad's devices, not the inner rack.

Not probed for either call: a pad with several chains, return tracks, Live 12.3,
and undo. One `song.undo()` took back every conversion a probe session had made,
so the remote script may need its own undo step.

Live 12.3 (the minimum) may lack `Live.Conversions` or some of its functions;
the route answers 409 "this Live version can't convert clips" then.
