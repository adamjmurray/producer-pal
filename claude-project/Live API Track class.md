# Track

This class represents a track in Live. It can either be an audio track, a MIDI track, a return track or the master track. The master track and at least one Audio or MIDI track will be always present. Return tracks are optional.

Not all properties are supported by all types of tracks. The properties are marked accordingly.

## Canonical Path

live_set tracks N

## Children

### clip_slots

**Type:** list of ClipSlot
**Attributes:** read-only, observe

### arrangement_clips

**Type:** list of Clip
**Attributes:** read-only, observe

The list of this track's Arrangement View clip IDs

_Available since Live 11.0._

### devices

**Type:** list of Device
**Attributes:** read-only, observe

Includes mixer device.

### group_track

**Type:** Track
**Attributes:** read-only

The Group Track, if the Track is grouped. If it is not, _id 0_ is returned.

### mixer_device

**Type:** MixerDevice
**Attributes:** read-only

### view

**Type:** Track.View
**Attributes:** read-only

## Properties

### arm

**Type:** bool
**Attributes:** observe

1 = track is armed for recording. [not in return/master tracks]

### available_input_routing_channels

**Type:** dictionary
**Attributes:** read-only, observe

The list of available source channels for the track's input routing. It's represented as a _dictionary_ with the following key:
`available_input_routing_channels` [list]
The list contains _dictionaries_ as described in _input_routing_channel_.
Only available on MIDI and audio tracks.

### available_input_routing_types

**Type:** dictionary
**Attributes:** read-only, observe

The list of available source types for the track's input routing. It's represented as a _dictionary_ with the following key:
`available_input_routing_types` [list]
The list contains _dictionaries_ as described in _input_routing_type_.
Only available on MIDI and audio tracks.

### available_output_routing_channels

**Type:** dictionary
**Attributes:** read-only, observe

The list of available target channels for the track's output routing. It's represented as a _dictionary_ with the following key:
`available_output_routing_channels` [list]
The list contains _dictionaries_ as described in _output_routing_channel_.
Not available on the master track.

### available_output_routing_types

**Type:** dictionary
**Attributes:** read-only, observe

The list of available target types for the track's output routing. It's represented as a _dictionary_ with the following key:
`available_output_routing_types` [list]
The list contains _dictionaries_ as described in _output_routing_type_.
Not available on the master track.

### back_to_arranger

**Type:** bool
**Attributes:** observe

Get/set/observe the current state of the Single Track Back to Arrangement button (1 = highlighted). This button is used to indicate that the current state of the playback differs from what is stored in the Arrangement.

Setting this property to 0 will make Live go back to playing the track's arrangement content. For group tracks, this means that all of the tracks that belong to the group and any subgroups will go back to playing the arrangement.

### can_be_armed

**Type:** bool
**Attributes:** read-only

0 for return and master tracks.

### can_be_frozen

**Type:** bool
**Attributes:** read-only

1 = the track can be frozen, 0 = otherwise.

### can_show_chains

**Type:** bool
**Attributes:** read-only

1 = the track contains an Instrument Rack device that can show chains in Session View.

### color

**Type:** int
**Attributes:** observe

The RGB value of the track's color in the form `0x00rrggbb` or (2^16 _ red) + (2^8) _ green + blue, where red, green and blue are values from 0 (dark) to 255 (light).

When setting the RGB value, the nearest color from the track color chooser is taken.

### color_index

**Type:** long
**Attributes:** observe

The color index of the track.

### fired_slot_index

**Type:** int
**Attributes:** read-only, observe

Reflects the blinking clip slot.
-1 = no slot fired, -2 = Clip Stop Button fired
First clip slot has index 0.
[not in return/master tracks]

### fold_state

**Type:** int
**Attributes:**

0 = tracks within the Group Track are visible, 1 = Group Track is folded and the tracks within the Group Track are hidden
[only available if `is_foldable` = 1]

### has_audio_input

**Type:** bool
**Attributes:** read-only

1 for audio tracks.

### has_audio_output

**Type:** bool
**Attributes:** read-only

1 for audio tracks and MIDI tracks with instruments.

### has_midi_input

**Type:** bool
**Attributes:** read-only

1 for MIDI tracks.

### has_midi_output

**Type:** bool
**Attributes:** read-only

1 for MIDI tracks with no instruments and no audio effects.

### implicit_arm

**Type:** bool
**Attributes:** observe

A second arm state, only used by Push so far.

### input_meter_left

**Type:** float
**Attributes:** read-only, observe

Smoothed momentary peak value of left channel input meter, 0.0 to 1.0. For tracks with audio output only. This value corresponds to the meters shown in Live. Please take into account that the left/right audio meters put a significant load onto the GUI part of Live.

### input_meter_level

**Type:** float
**Attributes:** read-only, observe

Hold peak value of input meters of audio and MIDI tracks, 0.0 ... 1.0. For audio tracks it is the maximum of the left and right channels. The hold time is 1 second.

### input_meter_right

**Type:** float
**Attributes:** read-only, observe

Smoothed momentary peak value of right channel input meter, 0.0 to 1.0. For tracks with audio output only. This value corresponds to the meters shown in Live.

### input_routing_channel

**Type:** dictionary
**Attributes:** observe

The currently selected source channel for the track's input routing. It's represented as a _dictionary_ with the following keys:
`display_name` [symbol]
`identifier` [symbol]
Can be set to all values found in the track's _available_input_routing_channels_.
Only available on MIDI and audio tracks.

### input_routing_type

**Type:** dictionary
**Attributes:** observe

The currently selected source type for the track's input routing. It's represented as a _dictionary_ with the following keys:
`display_name` [symbol]
`identifier` [symbol]
Can be set to all values found in the track's _available_input_routing_types_.
Only available on MIDI and audio tracks.

### is_foldable

**Type:** bool
**Attributes:** read-only

1 = track can be (un)folded to hide or reveal the contained tracks. This is currently the case for Group Tracks. Instrument and Drum Racks return 0 although they can be opened/closed. This will be fixed in a later release.

### is_frozen

**Type:** bool
**Attributes:** read-only, observe

1 = the track is currently frozen.

### is_grouped

**Type:** bool
**Attributes:** read-only

1 = the track is contained within a Group Track.

### is_part_of_selection

**Type:** bool
**Attributes:** read-only

### is_showing_chains

**Type:** bool
**Attributes:** observe

Get or set whether a track with an Instrument Rack device is currently showing its chains in Session View.

### is_visible

**Type:** bool
**Attributes:** read-only

0 = track is hidden in a folded Group Track.

### mute

**Type:** bool
**Attributes:** observe

[not in master track]

### muted_via_solo

**Type:** bool
**Attributes:** read-only, observe

1 = the track or chain is muted due to Solo being active on at least one other track.

### name

**Type:** symbol
**Attributes:** observe

As shown in track header.

### output_meter_left

**Type:** float
**Attributes:** read-only, observe

Smoothed momentary peak value of left channel output meter, 0.0 to 1.0. For tracks with audio output only. This value corresponds to the meters shown in Live. Please take into account that the left/right audio meters add a significant load to Live GUI resource usage.

### output_meter_level

**Type:** float
**Attributes:** read-only, observe

Hold peak value of output meters of audio and MIDI tracks, 0.0 to 1.0. For audio tracks, it is the maximum of the left and right channels. The hold time is 1 second.

### output_meter_right

**Type:** float
**Attributes:** read-only, observe

Smoothed momentary peak value of right channel output meter, 0.0 to 1.0. For tracks with audio output only. This value corresponds to the meters shown in Live.

### performance_impact

**Type:** float
**Attributes:** read-only, observe

Reports the performance impact of this track.

### output_routing_channel

**Type:** dictionary
**Attributes:** observe

The currently selected target channel for the track's output routing. It's represented as a _dictionary_ with the following keys:
`display_name` [symbol]
`identifier` [symbol]
Can be set to all values found in the track's _available_output_routing_channels_.
Not available on the master track.

### output_routing_type

**Type:** dictionary
**Attributes:** observe

The currently selected target type for the track's output routing. It's represented as a _dictionary_ with the following keys:
`display_name` [symbol]
`identifier` [symbol]
Can be set to all values found in the track's _available_output_routing_types_.
Not available on the master track.

### playing_slot_index

**Type:** int
**Attributes:** read-only, observe

First slot has index 0, -2 = Clip Stop slot fired in Session View, -1 = Arrangement recording with no Session clip playing. [not in return/master tracks]

### solo

**Type:** bool
**Attributes:** observe

Remark: when setting this property, the exclusive Solo logic is bypassed, so you have to unsolo the other tracks yourself. [not in master track]

## Functions

### create_audio_clip

Parameters:
`file_path` [symbol]
`position` [float]
Given an absolute path to a valid audio file in a supported format, creates an audio clip that references the file at the specified position in the arrangement view. Prints an error if the track is not an audio track, if the track is frozen, or if the track is being recorded into. The position must be within the range [0., 1576800].

See the `ClipSlot.create_audio_clip` function if you need to create audio clips in session view instead.

### create_midi_clip

Parameters:
`start_time` [float]
`length` [float]
Creates an empty MIDI clip and inserts it into the arrangement at the specified time. Throws an error when called on a non-MIDI track or a frozen track, when the specified time is outside the [0., 1576800.] range, or when the track is currently being recorded into.

See the `ClipSlot.create_clip` function if you need to create audio clips in session view instead.

### delete_clip

Parameter: `clip`
Delete the given clip.

### delete_device

Parameter: `index`
Delete the device at the given index.

### duplicate_clip_slot

Parameter: `index`
Works like 'Duplicate' in a clip's context menu.

### duplicate_clip_to_arrangement

Parameters: `clip`
`destination_time` [float]
Duplicate the given clip to the Arrangement, placing it at the given _destination_time_ in beats.

### jump_in_running_session_clip

Parameter: `beats`
`beats` [float] is the amount to jump relatively to the current clip position.
Modify playback position in running Session clip, if any.

### stop_all_clips

Stops all playing and fired clips in this track.
