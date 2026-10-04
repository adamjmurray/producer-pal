# Missing from Max's allowlist (Live 12.4.6)

Members of the Python Live API that aren't in Max's `LiveAPI` allowlist (see
[README.md](README.md)). Not each tested from Max: before building on one, check
it with Max's `info`. Spot checks agree with the list (`Clip.is_session_clip`,
`RackDevice.macros_mapped`). Listeners are left out: Max has its own observers.

| Class                   | Members                                                                                                                                                  | Note                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Song                    | `begin_undo_step`, `end_undo_step`                                                                                                                       | group several changes into one undo                                                                        |
| Song, Track             | `get_data`, `set_data`                                                                                                                                   | key/value storage saved in the Set                                                                         |
| Song                    | `sync_parameter_changes`                                                                                                                                 | new in 12.4                                                                                                |
| Track, Chain, DrumChain | `duplicate_device`                                                                                                                                       | Max has no call for it; Producer Pal copies the track and takes the device off the copy                    |
| Track                   | `monitoring_states`                                                                                                                                      | the list of monitoring choices                                                                             |
| Clip                    | `automation_envelope`, `automation_envelopes`, `create_automation_envelope`                                                                              | clip automation                                                                                            |
| Clip                    | `is_session_clip`, `is_take_lane_clip`                                                                                                                   | likely in Max from a later Live; a clip's path already says where it is                                    |
| Clip                    | `beat_to_sample_time`, `sample_to_beat_time`, `seconds_to_sample_time`, `note_number_to_name`                                                            |                                                                                                            |
| Sample                  | `beat_to_sample_time`, `sample_to_beat_time`                                                                                                             |                                                                                                            |
| MixerDevice             | `crossfade_assignments`, `panning_modes`                                                                                                                 | the choice lists; Max has the values                                                                       |
| DeviceParameter         | `begin_gesture`, `end_gesture`, `short_value_items`                                                                                                      |                                                                                                            |
| RackDevice              | `macros_mapped`                                                                                                                                          | which macros are mapped; used by `/device/macros`, see [rack-macro-mappings.md](../rack-macro-mappings.md) |
| SimplerDevice           | `pitch_bend_range`, `note_pitch_bend_range`                                                                                                              | read/write; in Max, Drift, Shifter and Spectral Resonator have `pitch_bend_range`                          |
| SimplerDevice.View      | `sample_start`, `sample_end`, `sample_loop_start`, `sample_loop_end`, `sample_loop_fade`, `sample_env_fade_in`, `sample_env_fade_out`                    | read-only, in samples                                                                                      |
| MaxDevice               | `get_value_item_icons`                                                                                                                                   |                                                                                                            |
| PluginDevice            | `get_parameter_names`                                                                                                                                    | the plug-in's own list, including parameters Live doesn't expose                                           |
| ShifterDevice           | `pitch_mode_list`                                                                                                                                        | the choice list; Max has the index                                                                         |
| SpectralResonatorDevice | `frequency_dial_mode_list`, `midi_gate_list`, `mod_mode_list`, `mono_poly_list`, `pitch_mode_list`                                                       | same                                                                                                       |
| TuningSystem            | `number_of_notes_in_pseudo_octave`                                                                                                                       | just `len(note_tunings)`                                                                                   |
| Application             | `browser`, `get_build_id`, `get_variant`, `has_option`, `show_message`, `show_on_the_fly_message`, `number_of_push_apps_running`, `unavailable_features` |                                                                                                            |
| CcControlDevice         | everything, even `name`                                                                                                                                  | Max's `info` lists no members for CC Control                                                               |

Not in Max's allowlist at all: every module-level function (below), the browser,
envelopes, `MidiNote` and `WarpMarker` structs, routing structs, and licensing.

## Module-level functions

Max can't call any of these. The useful ones:

- **`Live.Conversions`**: what Push 2's Convert button does (`Push2/convert.py`
  in Live's MIDI Remote Scripts).
  - `audio_to_midi_clip(song, clip, type)`: Convert Drums, Harmony or Melody to
    a new MIDI track. `type` is a `Conversions.AudioToMidiType`;
    `is_convertible_to_midi(song, clip)` says whether a clip can be converted.
  - `create_midi_track_with_simpler(song, clip)`: new MIDI track with a Simpler
    playing the audio clip.
  - `create_drum_rack_from_audio_clip(song, clip)`: new track with a Drum Rack,
    the clip in a Simpler on the first pad.
  - `sliced_simpler_to_drum_rack(song, simpler)`: one pad per slice.
  - `move_devices_on_track_to_new_drum_rack_pad(song, track_index)`: moves the
    track's devices onto pad C1 of a new Drum Rack on a new track.
  - `create_midi_track_from_drum_pad(song, drum_pad)`: copies a pad's chain to
    its own MIDI track.
- **`Live.Song.get_all_scales_ordered()`**: every scale name with its intervals.
- **`Live.SimplerDevice.get_available_voice_numbers()`**: valid Simpler voice
  counts.

The rest are licensing, logging, and `Live.MidiMap`, which maps a control
surface's own MIDI input to parameters.

## Grooves and tuning systems

Nothing useful is Python-only here; Max reads and writes the same things.

- **Groove:** `name`, `base`, and the `timing`, `quantization`, `random` and
  `velocity` amounts (0–100; out-of-range values are clamped). `base` is 0 =
  1/4, 1 = 1/8, 2 = 1/8T, 3 = 1/16, 4 = 1/16T, 5 = 1/32. Assign one to a clip
  with `set groove id N`.
- **TuningSystem:** `name`, `reference_pitch`, `lowest_note`, `highest_note` and
  `note_tunings` (cents per step) are read/write. Max reads and writes the
  structs as JSON strings, e.g.
  `{"index_in_octave": 14, "octave": 3, "frequency": 440.0}` and
  `{"note_tunings": [0.0, 63.2, …]}`. `pseudo_octave_in_cents` is read-only.

Limits in both APIs:

- `note_tunings` must keep the same number of steps.
- Neither API can create or remove a groove or a tuning system.
- Neither can clear a clip's groove: Max ignores `set groove id 0`, and Python
  rejects `None`.
- A bad write raises in Python, but **Max ignores it silently** and `set` still
  returns 1, so read the value back to check.

## New in 12.4.6 (compared with 12.3.6)

`Envelope.create_event`, `PluginDevice.is_editor_open` (whether the plug-in's
window is open), `SimplerDevice.replace_sample`, `Song.sync_parameter_changes`,
and `WavetableDevice.VoiceCount.sixteen`.
