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

`sliced_simpler_to_drum_rack(song, simpler)` is not exposed yet. Measured on
Live 12.4.16 with 1-bar and 8-bar drum loops.

- **It works at once**, unlike the clip conversions: the Drum Rack is there
  before the call returns.
- **It replaces the Simpler in place.** Same track, same device position, no new
  track. The rack is a new device that keeps the Simpler's name; the track name
  doesn't change.
- **One pad per slice, from C1 (36) up**, named "Slice 1", "Slice 2", … Each
  pad's chain holds one Simpler in one-shot mode on the same sample file, with
  its start and end markers at the slice's bounds. Every chain is in choke
  group 1. Simpler allows at most 64 slices, so the pads never run out.
- A Simpler that isn't in slicing mode raises
  `RuntimeError('Can only convert to drum rack if sliced')`.
- **Never replace the sample and convert in the same main-thread call: Live
  crashes** (null pointer, twice out of two tries). `replace_sample` in one
  request and the conversion in the next is fine, even with no wait between
  them. Setting slicing mode or the slice settings in the same call as the
  conversion is also fine.

Not probed: a track that already has MIDI clips, a Simpler inside a rack, undo
steps, warped samples, and Live 12.3.

Live 12.3 (the minimum) may lack `Live.Conversions` or some of its functions;
the route answers 409 "this Live version can't convert clips" then.
