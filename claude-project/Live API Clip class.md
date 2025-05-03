# Clip

This class represents a clip in Live. It can be either an audio clip or a MIDI clip in the Arrangement or Session View, depending on the track / slot it lives in.

## Canonical Paths

`live_set tracks N clip_slots M clip`

`live_set tracks N arrangement_clips M`

## Children

### view

**type:** Clip.View
**attributes:** read-only

## Properties

### available_warp_modes

**type:** list
**attributes:** read-only

Returns the list of indexes of the Warp Modes available for the clip. Only valid for audio clips.

### color

**type:** int
**attributes:** observe

The RGB value of the clip's color in the form `0x00rrggbb` or (2^16 _ red) + (2^8) _ green + blue, where red, green and blue are values from 0 (dark) to 255 (light).

When setting the RGB value, the nearest color from the clip color chooser is taken.

### color_index

**type:** int
**attributes:** observe

The clip's color index.

### end_marker

**type:** float
**attributes:** observe

The end marker of the clip in beats, independent of the loop state. Cannot be set before the start marker.

### end_time

**type:** float
**attributes:** read-only, observe

The end time of the clip. For Session View clips, if Loop is on, this is the Loop End, otherwise it's the End Marker. For Arrangement View clips, this is always the position of the clip's rightmost edge in the Arrangement.

### gain

**type:** float
**attributes:** observe

The gain of the clip (range is 0.0 to 1.0). Only valid for audio clips.

### gain_display_string

**type:** symbol
**attributes:** read-only

Get the gain display value of the clip as a string (e.g. "1.3 dB"). Can only be called on audio clips.

### file_path

**type:** symbol
**attributes:** read-only

Get the location of the audio file represented by the clip. Only available for audio clips.

### groove

**type:** Groove
**attributes:** observe

Get/set/observe access to the groove associated with this clip.

_Available since Live 11.0._

### has_envelopes

**type:** bool
**attributes:** read-only, observe

Get/observe whether the clip has any automation.

### has_groove

**type:** bool
**attributes:** read-only

Returns true if a groove is associated with this clip.

_Available since Live 11.0._

### is_arrangement_clip

**type:** bool
**attributes:** read-only

1 = The clip is an Arrangement clip.
A clip can be either an Arrangement or a Session clip.

### is_audio_clip

**type:** bool
**attributes:** read-only

0 = MIDI clip, 1 = audio clip

### is_midi_clip

**type:** bool
**attributes:** read-only

The opposite of `is_audio_clip`.

### is_overdubbing

**type:** bool
**attributes:** read-only, observe

1 = clip is overdubbing.

### is_playing

**type:** bool

1 = clip is playing or recording.

### is_recording

**type:** bool
**attributes:** read-only, observe

1 = clip is recording.

### is_triggered

**type:** bool
**attributes:** read-only

1 = Clip Launch button is blinking.

### launch_mode

**type:** int
**attributes:** observe

The Launch Mode of the Clip as an integer index. Available Launch Modes are:
0 = Trigger (default)
1 = Gate
2 = Toggle
3 = Repeat

_Available since Live 11.0._

### launch_quantization

**type:** int
**attributes:** observe

The Launch Quantization of the Clip as an integer index. Available Launch Quantization values are:
0 = Global (default)
1 = None
2 = 8 Bars
3 = 4 Bars
4 = 2 Bars
5 = 1 Bar
6 = 1/2
7 = 1/2T
8 = 1/4
9 = 1/4T
10 = 1/8
11 = 1/8T
12 = 1/16
13 = 1/16T
14 = 1/32

_Available since Live 11.0._

### legato

**type:** bool
**attributes:** observe

1 = Legato Mode switch in the Clip's Launch settings is on.

_Available since Live 11.0._

### length

**type:** float
**attributes:** read-only

For looped clips: loop length in beats. Otherwise it's the distance in beats from start to end marker. Makes no sense for unwarped audio clips.

### loop_end

**type:** float
**attributes:** observe

For looped clips: loop end.
For unlooped clips: clip end.

### loop_jump

**type:** bang
**attributes:** observe

Bangs when the clip play position is crossing the loop start marker (possibly projected into the loop).

### loop_start

**type:** float
**attributes:** observe

For looped clips: loop start.
For unlooped clips: clip start.

loop_start and loop_end are in absolute clip beat time if clip is MIDI or warped. The 1.1.1 position has beat time 0. If the clip is unwarped audio, they are given in seconds, 0 is the time of the first sample in the audio material.

### looping

**type:** bool
**attributes:** observe

1 = clip is looped. Unwarped audio cannot be looped.

### muted

**type:** bool
**attributes:** observe

1 = muted (i.e. the Clip Activator button of the clip is off).

### name

**type:** symbol
**attributes:** observe

### notes

**type:** bang
**attributes:** observe

Observer sends bang when the list of notes changes.
Available for MIDI clips only.

### warp_markers

**type:** dict/bang
**attributes:** read-only, observe

The Clip's Warp Markers as a dict. Observing this property bangs when the warp_markers change.

The last Warp Marker in the dict is not visible in the Live interface. This hidden marker is used to calculate the BPM of the last segment.

Available for audio clips only.

_Getting is available since Live 11.0._

### pitch_coarse

**type:** int
**attributes:** observe

Pitch shift in semitones ("Transpose"), -48 ... 48.
Available for audio clips only.

### pitch_fine

**type:** float
**attributes:** observe

Extra pitch shift in cents ("Detune"), -50 ... 49.
Available for audio clips only.

### playing_position

**type:** float
**attributes:** read-only, observe

Current playing position of the clip.

For MIDI and warped audio clips, the value is given in beats of absolute clip time. The clip's beat time of 0 is where 1 is shown in the bar/beat/16th time scale at the top of the clip view.

For unwarped audio clips, the position is given in seconds, according to the time scale shown at the bottom of the clip view.

Stopped clips have a playing position of 0.

### playing_status

**type:** bang
**attributes:** observe

Observer sends bang when playing/trigger status changes.

### position

**type:** float
**attributes:** read-only, observe

Get and set the clip's loop position. The value will always equal loop_start, however setting this property, unlike setting loop_start, preserves the loop length.

### ram_mode

**type:** bool
**attributes:** observe

1 = an audio clip's RAM switch is enabled.

### sample_length

**type:** int
**attributes:** read-only

Length of the Clip's sample, in samples.

### sample_rate

**type:** float
**attributes:** read-only

Get the Clip's sample rate.

### signature_denominator

**type:** int
**attributes:** observe

### signature_numerator

**type:** int
**attributes:** observe

### start_marker

**type:** float
**attributes:** observe

The start marker of the clip in beats, independent of the loop state. Cannot be set behind the end marker.

### start_time

**type:** float
**attributes:** read-only, observe

The start time of the clip, relative to the global song time. The value is in beats.

For Arrangement View clips, this is the offset within the arrangement. For Session View clips, this is the time the clip was started. Note that what is reported is the start_time of the currently playing clip on the track, regardless of which clip.

When a Session View clip's playback position was offset by clicking in its time ruler in the Clip Detail View or moving its start marker, its start_time may be negative. This allows using the start_time as an offset when calculating the clip's current playback position based on the global song time.

### velocity_amount

**type:** float
**attributes:** observe

How much the velocity of the note that triggers the clip affects its volume, 0 = no effect, 1 = full effect.

_Available since Live 11.0._

### warp_mode

**type:** int
**attributes:** observe

The Warp Mode of the clip as an integer index. Available Warp Modes are:
0 = Beats Mode
1 = Tones Mode
2 = Texture Mode
3 = Re-Pitch Mode
4 = Complex Mode
5 = REX Mode
6 = Complex Pro Mode
Available for audio clips only.

### warping

**type:** bool
**attributes:** observe

1 = Warp switch is on.
Available for audio clips only.

Technical note: Internally, Live will defer the setting of this property. This has the consequence that if you are sequencing API calls from a single event, the actual order of operations may differ from what you'd intuitively expect. Most of the time this should be transparent to you, but if you run into issues, please report them.

### will_record_on_start

**type:** bool
**attributes:** read-only

1 for MIDI clips which are in triggered state, with the track armed and MIDI Arrangement Overdub on.

## Functions

### add_new_notes

Parameter:
`dictionary`
Key: `"notes"` [list of note specification dictionaries]
Note specification dictionaries have the following keys:
`pitch` : [int] the MIDI note number, 0...127, 60 is C3.
`start_time` : [float] the note start time in beats of absolute clip time.
`duration` : [float] the note length in beats.
`velocity (optional)` : [float] the note velocity, 0 ... 127 _(100 by default)_.
`mute (optional)` : [bool] 1 = the note is deactivated _(0 by default)_.
`probability (optional)` : [float] the chance that the note will be played:
1.0 = the note is always played
0.0 = the note is never played
_(1.0 by default)_.
`velocity_deviation (optional)` : [float] the range of velocity values at which the note can be played:
0.0 = no deviation; the note will always play at the velocity specified by the _velocity_ property
-127.0 to 127.0 = the note will be assigned a velocity value between _velocity_ and _velocity + velocity_deviation_, inclusive; if the resulting range exceeds the limits of MIDI velocity (0 to 127), then it will be clamped within those limits
_(0.0 by default)_.
`release_velocity (optional)` : [float] the note release velocity _(64 by default)_.
Returns a list of note IDs of the added notes.

For MIDI clips only.

_Available since Live 11.0._

### add_warp_marker

Only available for warped Audio Clips. Adds the specified warp marker, if possible.

The warp marker is specified as a dict which can have a `beat_time` and a `sample_time` key, both associated with float values.
The `sample_time` key may be omitted; in this case, Live will calculate the appropriate sample time to create a warp marker at the specified beat time without changing the Clip's playback timing, similar to what would happen if you were to double-click in the upper half of the Sample Display in Clip View.

If `sample_time` is specified, certain limitations must be taken into account:

- The sample time must lie within the range _[0, s]_, where _s_ is the sample's length. The `sample_length` Clip property helps with this.
- The sample time must lie between the left and right adjacents markers' respective sample times (this is a logical constraint).
- Within these constraints, there are limitations on the resulting segments' BPM. The allowed BPM range is _[5, 999]_.

### apply_note_modifications

Parameter:
`dictionary`
Key: `"notes"` [list of note dictionaries] as returned from `get_notes_extended`.
The list of note dictionaries passed to the function can be a subset of notes in the clip, but will be ignored if it contains any notes that are not present in the clip.

For MIDI clips only.

_Available since Live 11.0. Replaces modifying notes with remove_notes followed by set_notes._

### clear_all_envelopes

Removes all automation in the clip.

### clear_envelope

Parameter:
`device_parameter` [id]
Removes the automation of the clip for the given parameter.

### crop

Crops the clip: if the clip is looped, the region outside the loop is removed; if it isn't, the region outside the start and end markers.

### deselect_all_notes

Call this before replace_selected_notes if you just want to add some notes.
Output:
`deselect_all_notes id 0`

For MIDI clips only.

### duplicate_loop

Makes the loop two times longer by moving loop_end to the right, and duplicates both the notes and the envelopes. If the clip is not looped, the clip start/end range is duplicated. Available for MIDI clips only.

### duplicate_notes_by_id

Parameter:
`list` of note IDs.
Or `dictionary`
Keys:
`note_ids` [list of note IDs] as returned from `get_notes_extended`
`destination_time (optional)` [float/int]
`transposition_amount (optional)` [int]
Duplicates all notes matching the given note IDs.
Provided note IDs must be associated with existing notes in the clip. Existing notes can be queried with `get_notes_extended`.
The selection of notes will be duplicated to _destination_time_, if provided. Otherwise the new notes will be inserted after the last selected note. This behavior can be observed when duplicating notes in the Live GUI.
If the _transposition_amount_ is specified, the duplicated notes will be transposed by the number of semitones.
Available for MIDI clips only.

_Available since Live 11.1.2_

### duplicate_region

Parameter:
`region_start` [float/int]
`region_length` [float/int]
`destination_time` [float/int]
`pitch (optional)` [int]
`transposition_amount (optional)` [int]
Duplicate the notes in the specified region to the _destination_time_. Only notes of the specified pitch are duplicated or all if _pitch_ is -1. If the _transposition_amount_ is not 0, the notes in the region will be transposed by the _transpose_amount_ of semitones. Available for MIDI clips only.

### fire

Same effect as pressing the Clip Launch button.

### get_all_notes_extended

Parameter:
`dict (optional)` [dict]
(See below for a discussion of this argument).

Returns a dictionary of all of the notes in the clip, regardless of where they are positioned with respect to the start/end markers and the loop start/loop end, as a list of note dictionaries. Each note dictionary consists of the following key-value pairs:
`note_id` : [int] the unique note identifier.
`pitch` : [int] the MIDI note number, 0...127, 60 is C3.
`start_time` : [float] the note start time in beats of absolute clip time.
`duration` : [float] the note length in beats.
`velocity` : [float] the note velocity, 0 ... 127.
`mute` : [bool] 1 = the note is deactivated.
`probability` : [float] the chance that the note will be played:
1.0 = the note is always played;
0.0 = the note is never played.
`velocity_deviation` : [float] the range of velocity values at which the note can be played:
0.0 = no deviation; the note will always play at the velocity specified by the _velocity_ property
-127.0 to 127.0 = the note will be assigned a velocity value between _velocity_ and _velocity + velocity_deviation_, inclusive; if the resulting range exceeds the limits of MIDI velocity (0 to 127), then it will be clamped within those limits.
`release_velocity` : [float] the note release velocity.

It is possible to optionally provide a single [dict] argument to this function, containing a single key-value pair: the key is "return" and the associated value is a list of the note properties as listed above in the discussion of the returned note dictionaries, e.g. ["note_id", "pitch", "velocity"]. The effect of this will be that the returned note dictionaries will only contain the key-value pairs for the specified properties, which can be useful to improve patch performance when processing large notes dictionaries.

For MIDI clips only.

_Available since Live 11.1_

### get_notes_by_id

Parameter:
`list` of note IDs.

Provided note IDs must be associated with existing notes in the clip. Existing notes can be queried with `get_notes_extended`.

Returns a dictionary of notes associated with the provided IDs, as a list of note dictionaries. Each note dictionary consists of the following key-value pairs:
`note_id` : [int] the unique note identifier.
`pitch` : [int] the MIDI note number, 0...127, 60 is C3.
`start_time` : [float] the note start time in beats of absolute clip time.
`duration` : [float] the note length in beats.
`velocity` : [float] the note velocity, 0 ... 127.
`mute` : [bool] 1 = the note is deactivated.
`probability` : [float] the chance that the note will be played:
1.0 = the note is always played;
0.0 = the note is never played.
`velocity_deviation` : [float] the range of velocity values at which the note can be played:
0.0 = no deviation; the note will always play at the velocity specified by the _velocity_ property
-127.0 to 127.0 = the note will be assigned a velocity value between _velocity_ and _velocity + velocity_deviation_, inclusive; if the resulting range exceeds the limits of MIDI velocity (0 to 127), then it will be clamped within those limits.
`release_velocity` : [float] the note release velocity.

It is possible to optionally provide the argument to this function in the form of a dictionary instead. The dictionary must include the "note_ids" key associated with a list of [int]s, which are the ID values you would like to pass to the function.

If you use this method, you can optionally provide an additional key-value pair: the key is "return" and the associated value is a list of the note properties as listed above in the discussion of the returned note dictionaries, e.g. ["note_id", "pitch", "velocity"]. The effect of this will be that the returned note dictionaries will only contain the key-value pairs for the specified properties, which can be useful to improve patch performance when processing large notes dictionaries.

For MIDI clips only.

_Available since Live 11.0._

### get_notes_extended

Parameters:
`from_pitch` [int]
`pitch_span` [int]
`from_time` [float]
`time_span` [float]

`from_time` and `time_span` are given in beats.

Returns a dictionary of notes that have their start times in the given area, as a list of note dictionaries. Each note dictionary consists of the following key-value pairs:
`note_id` : [int] the unique note identifier.
`pitch` : [int] the MIDI note number, 0...127, 60 is C3.
`start_time` : [float] the note start time in beats of absolute clip time.
`duration` : [float] the note length in beats.
`velocity` : [float] the note velocity, 0 ... 127.
`mute` : [bool] 1 = the note is deactivated.
`probability` : [float] the chance that the note will be played:
1.0 = the note is always played;
0.0 = the note is never played.
`velocity_deviation` : [float] the range of velocity values at which the note can be played:
0.0 = no deviation; the note will always play at the velocity specified by the _velocity_ property
-127.0 to 127.0 = the note will be assigned a velocity value between _velocity_ and _velocity + velocity_deviation_, inclusive; if the resulting range exceeds the limits of MIDI velocity (0 to 127), then it will be clamped within those limits.
`release_velocity` : [float] the note release velocity.

It is possible to optionally provide the arguments to this function in the form of a single dictionary instead. The dictionary must include all of the parameter names given above as its keys; the associated values are the parameter values you wish to pass to the function.

If you use this method, you can optionally provide an additional key-value pair: the key is "return" and the associated value is a list of the note properties as listed above in the discussion of the returned note dictionaries, e.g. ["note_id", "pitch", "velocity"]. The effect of this will be that the returned note dictionaries will only contain the key-value pairs for the specified properties, which can be useful to improve patch performance when processing large notes dictionaries.

For MIDI clips only.

_Available since Live 11.0. Replaces get_notes._

### get_selected_notes_extended

Parameter:
`dict (optional)` [dict]
(See below for a discussion of this argument).

Returns a dictionary of the selected notes in the clip, as a list of note dictionaries. Each note dictionary consists of the following key-value pairs:
`note_id` : [int] the unique note identifier.
`pitch` : [int] the MIDI note number, 0...127, 60 is C3.
`start_time` : [float] the note start time in beats of absolute clip time.
`duration` : [float] the note length in beats.
`velocity` : [float] the note velocity, 0 ... 127.
`mute` : [bool] 1 = the note is deactivated.
`probability` : [float] the chance that the note will be played:
1.0 = the note is always played;
0.0 = the note is never played.
`velocity_deviation` : [float] the range of velocity values at which the note can be played:
0.0 = no deviation; the note will always play at the velocity specified by the _velocity_ property
-127.0 to 127.0 = the note will be assigned a velocity value between _velocity_ and _velocity + velocity_deviation_, inclusive; if the resulting range exceeds the limits of MIDI velocity (0 to 127), then it will be clamped within those limits.
`release_velocity` : [float] the note release velocity.

It is possible to optionally provide a single [dict] argument to this function, containing a single key-value pair: the key is "return" and the associated value is a list of the note properties as listed above in the discussion of the returned note dictionaries, e.g. ["note_id", "pitch", "velocity"]. The effect of this will be that the returned note dictionaries will only contain the key-value pairs for the specified properties, which can be useful to improve patch performance when processing large notes dictionaries.

For MIDI clips only.

_Available since Live 11.0. Replaces get_selected_notes._

### move_playing_pos

Parameter: `beats`
`beats` [float] relative jump distance in beats. Negative beats jump backwards.
Jumps by given amount, unquantized.
Unwarped audio clips, recording audio clips and recording non-overdub MIDI clips cannot jump.

### move_warp_marker

Parameters: `beat_time` [float]
`beat_time_distance` [float]
Moves the warp marker specified by _beat_time_ the specified beat time distance.

### quantize

Parameter:
`quantization_grid` [int]
`amount` [float]
Quantizes all notes in the clip to the quantization_grid taking the song's swing_amount into account.

### quantize_pitch

Parameter:
`pitch` [int]
`quantization_grid` [int]
`amount` [float]
Same as _quantize_, but only for notes in the given pitch.

### remove_notes_by_id

Parameter:
`list` of note IDs.
Deletes all notes associated with the provided IDs.
Provided note IDs must be associated with existing notes in the clip. Existing notes can be queried with `get_notes_extended`.

_Available since Live 11.0._

### remove_notes_extended

Parameter:
`from_pitch` [int]
`pitch_span` [int]
`from_time` [float]
`time_span` [float]
Deletes all notes that start in the given area. `from_time` and `time_span` are given in beats.

_Available since Live 11.0. Replaces remove_notes._

### remove_warp_marker

Parameter: `beat_time` [float]
Removes the warp marker at the given beat time.

### scrub

Parameter: `beat_time` [float]
Scrub the clip to a time, specified in beats. This behaves exactly like scrubbing with the mouse; the scrub will respect Global Quantization, starting and looping in time with the transport. The scrub will continue until stop_scrub() is called.

### select_all_notes

Use this function to process all notes of a clip, independent of the current selection.

Output:
`select_all_notes id 0`

For MIDI clips only.

### select_notes_by_id

Parameter:
`list` of note IDs.
Selects all notes associated with the provided IDs.

Note that this function will _not_ print a warning or error if the list contains nonexistent IDs.

_Available since Live 11.0.6_

### set_fire_button_state

Parameter: `state` [bool]
If the state is set to 1, Live simulates pressing the clip start button until the state is set to 0, or until the clip is otherwise stopped.

### stop

Same effect as pressing the stop button of the track, but only if this clip is actually playing or recording. If this clip is triggered or if another clip in this track is playing, it has no effect.

### stop_scrub

Stops an active scrub on a clip.
