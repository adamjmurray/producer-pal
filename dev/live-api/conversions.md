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

Live 12.3 (the minimum) may lack `Live.Conversions` or some of its functions;
the route answers 409 "this Live version can't convert clips" then.
