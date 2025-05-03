# Song

This class represents a Live Set. The current Live Set is reachable by the root path `live_set`.

## Canonical Path

`live_set`

## Children

### cue_points

**Type:** list of CuePoint
**Attributes:** read-only, observe

Cue points are the markers in the Arrangement to which you can jump.

### return_tracks

**Type:** list of Track
**Attributes:** read-only, observe

### scenes

**Type:** list of Scene
**Attributes:** read-only, observe

### tracks

**Type:** list of Track
**Attributes:** read-only, observe

### visible_tracks

**Type:** list of Track
**Attributes:** read-only, observe

A track is visible if it's not part of a folded group. If a track is scrolled out of view it's still considered visible.

### master_track

**Type:** Track
**Attributes:** read-only

### view

**Type:** Song.View
**Attributes:** read-only

### groove_pool

**Type:** GroovePool
**Attributes:** read-only

Live's groove pool.

_Available since Live 11.0._

### tuning_system

**Type:** TuningSystem
**Attributes:** read-only, observe

Live's currently active tuning system.

## Properties

### appointed_device

**Type:** Device
**Attributes:** read-only, observe

The appointed device is the one used by a control surface unless the control surface itself chooses which device to use. It is marked by a blue hand.

### arrangement_overdub

**Type:** bool
**Attributes:** observe

Get/set the state of the MIDI Arrangement Overdub button.

### back_to_arranger

**Type:** bool
**Attributes:** observe

Get/set/observe the current state of the Back to Arrangement button located in Live's transport bar (1 = highlighted). This button is used to indicate that the current state of the playback differs from what is stored in the Arrangement.

Setting this property to 0 will make Live go back to playing the content of the arrangement.

### can_capture_midi

**Type:** bool
**Attributes:** read-only, observe

1 = Recently played MIDI material exists that can be captured into a Live Track. See _capture_midi_.

### can_jump_to_next_cue

**Type:** bool
**Attributes:** read-only, observe

0 = there is no cue point to the right of the current one, or none at all.

### can_jump_to_prev_cue

**Type:** bool
**Attributes:** read-only, observe

0 = there is no cue point to the left of the current one, or none at all.

### can_redo

**Type:** bool
**Attributes:** read-only

1 = there is something in the history to redo.

### can_undo

**Type:** bool
**Attributes:** read-only

1 = there is something in the history to undo.

### clip_trigger_quantization

**Type:** int
**Attributes:** observe

Reflects the quantization setting in the transport bar.
0 = None
1 = 8 Bars
2 = 4 Bars
3 = 2 Bars
4 = 1 Bar
5 = 1/2
6 = 1/2T
7 = 1/4
8 = 1/4T
9 = 1/8
10 = 1/8T
11 = 1/16
12 = 1/16T
13 = 1/32

### count_in_duration

**Type:** int
**Attributes:** read-only, observe

The duration of the Metronome's Count-In setting as an index, mapped as follows:
0 = None
1 = 1 Bar
2 = 2 Bars
3 = 4 Bars

### current_song_time

**Type:** float
**Attributes:** observe

The playing position in the Live Set, in beats.

### exclusive_arm

**Type:** bool
**Attributes:** read-only

Current status of the exclusive Arm option set in the Live preferences.

### exclusive_solo

**Type:** bool
**Attributes:** read-only

Current status of the exclusive Solo option set in the Live preferences.

### file_path

**Type:** symbol
**Attributes:** read-only

The path to the current Live Set, in OS-native format. If the Live Set hasn't been saved, the path is empty.

### groove_amount

**Type:** float
**Attributes:** observe

The groove amount from the current set's groove pool (0. - 1.0).

### is_ableton_link_enabled

**Type:** bool
**Attributes:** observe

Enable/disable Ableton Link. The Link toggle in the Live's transport bar must be visible to enable Link.

### is_ableton_link_start_stop_sync_enabled

**Type:** bool
**Attributes:** observe

Enable/disable Ableton Link Start Stop Sync.

### is_counting_in

**Type:** bool
**Attributes:** read-only, observe

1 = the Metronome is currently counting in.

### is_playing

**Type:** bool
**Attributes:** observe

Get/set if Live's transport is running.

### last_event_time

**Type:** float
**Attributes:** read-only

The beat time of the last event (i.e. automation breakpoint, clip end, cue point, loop end) in the Arrangement.

### loop

**Type:** bool
**Attributes:** observe

Get/set the enabled state of the Arrangement loop.

### loop_length

**Type:** float
**Attributes:** observe

Arrangement loop length in beats.

### loop_start

**Type:** float
**Attributes:** observe

Arrangement loop start in beats.

### metronome

**Type:** bool
**Attributes:** observe

Get/set the enabled state of the metronome.

### midi_recording_quantization

**Type:** int
**Attributes:** observe

Get/set the current Record Quantization value.
0 = None
1 = 1/4
2 = 1/8
3 = 1/8T
4 = 1/8 + 1/8T
5 = 1/16
6 = 1/16T
7 = 1/16 + 1/16T
8 = 1/32

### name

**Type:** symbol
**Attributes:** read-only

The name of the current Live Set. If the Live Set hasn't been saved, the name is empty.

### nudge_down

**Type:** bool
**Attributes:** observe

1 = the Tempo Nudge Down button in the transport bar is currently pressed.

### nudge_up

**Type:** bool
**Attributes:** observe

1 = the Tempo Nudge Up button in the transport bar is currently pressed.

### tempo_follower_enabled

**Type:** bool
**Attributes:** observe

1 = the Tempo Follower controls the tempo. The Tempo Follower Toggle must be made visible in the preferences for this property to be effective.

### overdub

**Type:** bool
**Attributes:** observe

1 = MIDI Arrangement Overdub is enabled in the transport.

### punch_in

**Type:** bool
**Attributes:** observe

1 = the Punch-In button is enabled in the transport.

### punch_out

**Type:** bool
**Attributes:** observe

1 = the Punch-Out button is enabled in the transport.

### re_enable_automation_enabled

**Type:** bool
**Attributes:** read-only, observe

1 = the Re-Enable Automation button is on.

### record_mode

**Type:** bool
**Attributes:** observe

1 = the Arrangement Record button is on.

### root_note

**Type:** int
**Attributes:** observe

The root note of the scale currently selected in Live. The root note can be a number between 0 and 11, where 0 = C and 11 = B.

### scale_intervals

**Type:** list
**Attributes:** read-only, observe

A list of integers representing the intervals in Live's current scale (see _scale_name_ and _scale_mode_). An interval is expressed as the difference between the scale degree at the list index and the first scale degree.

### scale_mode

**Type:** bool
**Attributes:** observe

Access to the Scale Mode setting in Live.

When on, key tracks that belong to the currently selected scale are highlighted in Live's MIDI Note Editor, and pitch-based parameters in MIDI Tools and Devices can be edited in scale degrees rather than semitones.

See also _root_note_, _scale_name_, and _scale_intervals_.

### scale_name

**Type:** unicode
**Attributes:** observe

The name of the scale selected in Live, as displayed in the Current Scale Name chooser.

### select_on_launch

**Type:** bool
**Attributes:** read-only

1 = the "Select on Launch" option is set in Live's preferences.

### session_automation_record

**Type:** bool
**Attributes:** observe

The state of the Automation Arm button.

### session_record

**Type:** bool
**Attributes:** observe

The state of the Session Overdub button.

### session_record_status

**Type:** int
**Attributes:** read-only, observe

Reflects the state of the Session Record button.

### signature_denominator

**Type:** int
**Attributes:** observe

### signature_numerator

**Type:** int
**Attributes:** observe

### song_length

**Type:** float
**Attributes:** read-only, observe

A little more than `last_event_time`, in beats.

### start_time

**Type:** float
**Attributes:** observe

The position in the Live Set where playing will start, in beats.

### swing_amount

**Type:** float
**Attributes:** observe

Range: 0.0 - 1.0; affects MIDI Recording Quantization and all direct calls to `Clip.quantize`.

### tempo

**Type:** float
**Attributes:** observe

Current tempo of the Live Set in BPM, 20.0 ... 999.0. The tempo may be automated, so it can change depending on the current song time.

## Functions

### capture_and_insert_scene

Capture the currently playing clips and insert them as a new scene below the selected scene.

### capture_midi

Parameter: `destination` [int]
0 = auto, 1 = session, 2 = arrangement
Capture recently played MIDI material from audible tracks into a Live Clip.
If _destinaton_ is not set or it is set to _auto_, the Clip is inserted into the view currently visible in the focused Live window. Otherwise, it is inserted into the specified view.

### continue_playing

From the current playback position.

### create_audio_track

Parameter: `index`
Index determines where the track is added, it is only valid between 0 and len(song.tracks). Using an index of -1 will add the new track at the end of the list.

### create_midi_track

Parameter: `index`
Index determines where the track is added, it is only valid between 0 and len(song.tracks). Using an index of -1 will add the new track at the end of the list.

### create_return_track

Adds a new return track at the end.

### create_scene

Parameter: `index`
Returns: The new scene
Index determines where the scene is added. It is only valid between 0 and len(song.scenes). Using an index of -1 will add the new scene at the end of the list.

### delete_scene

Parameter: `index`
Delete the scene at the given index.

### delete_track

Parameter: `index`
Delete the track at the given index.

### delete_return_track

Parameter: `index`
Delete the return track at the given index.

### duplicate_scene

Parameter: `index`
Index determines which scene to duplicate.

### duplicate_track

Parameter: `index`
Index determines which track to duplicate.

### find_device_position

Parameter:
`device` [live object]
`target` [live object]
`target position` [int]
Returns:
[int] The position in the target's chain where the device can be inserted that is the closest possible to the target position.

### force_link_beat_time

Force the Link timeline to jump to Live's current beat time.

### get_beats_loop_length

Returns: `bars.beats.sixteenths.ticks` [symbol]
The Arrangement loop length.

### get_beats_loop_start

Returns: `bars.beats.sixteenths.ticks` [symbol]
The Arrangement loop start.

### get_current_beats_song_time

Returns: `bars.beats.sixteenths.ticks` [symbol]
The current Arrangement playback position.

### get_current_smpte_song_time

Parameter: `format`
`format` [int] is the time code type to be returned
0 = the frame position shows the milliseconds
1 = Smpte24
2 = Smpte25
3 = Smpte30
4 = Smpte30Drop
5 = Smpte29
Returns: _hours:min:sec_ [symbol]
The current Arrangement playback position.

### is_cue_point_selected

Returns: bool 1 = the current Arrangement playback position is at a cue point

### jump_by

Parameter: `beats`
`beats` [float] is the amount to jump relatively to the current position

### jump_to_next_cue

Jump to the right, if possible.

### jump_to_prev_cue

Jump to the left, if possible.

### move_device

Parameter:
`device` [live object]
`target` [live object]
`target position` [int]
Returns: [int] The position in the target's chain where the device was inserted.
Move the device to the specified position in the target chain. If the device cannot be moved to the specified position, the nearest possible position is chosen.

### play_selection

Do nothing if no selection is set in Arrangement, or play the current selection.

### re_enable_automation

Trigger 'Re-Enable Automation', re-activating automation in all running Session clips.

### redo

Causes the Live application to redo the last operation.

### scrub_by

Parameter: `beats`
`beats` [float] the amount to scrub relative to the current Arrangement playback position
Same as `jump_by`, at the moment.

### set_or_delete_cue

Toggle cue point at current Arrangement playback position.

### start_playing

Start playback from the insert marker.

### stop_all_clips

Parameter (optional): `quantized`
Calling the function with 0 will stop all clips immediately, independent of the launch quantization. The default is '1'.

### stop_playing

Stop the playback.

### tap_tempo

Same as pressing the Tap Tempo button in the transport bar. The new tempo is calculated based on the time between subsequent calls of this function.

### trigger_session_record

Parameter: `record_length (optional)`
Starts recording in either the selected slot or the next empty slot, if the track is armed. If _record_length_ is provided, the slot will record for the given length in beats.
If triggered while recording, recording will stop and clip playback will start.

### undo

Causes the Live application to undo the last operation.
