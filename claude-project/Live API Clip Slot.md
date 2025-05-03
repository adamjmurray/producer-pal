# ClipSlot

This class represents an entry in Live's Session View matrix.

The properties `playing_status`, `is_playing` and `is_recording` are useful for clip slots of Group Tracks. These are always empty and represent the state of the clips in the tracks within the Group Track.

## Canonical Path

live_set tracks N clip_slots M

## Children

### clip

**Type:** Clip
**Attributes:** read-only

`id 0` if slot is empty

## Properties

### color

**Type:** long
**Attributes:** read-only, observe

The color of the first clip in the Group Track if the clip slot is a Group Track slot.

### color_index

**Type:** long
**Attributes:** read-only, observe

The color index of the first clip in the Group Track if the clip slot is a Group Track slot.

### controls_other_clips

**Type:** bool
**Attributes:** read-only, observe

1 for a Group Track slot that has non-deactivated clips in the tracks within its group.
Control of empty clip slots doesn't count.

### has_clip

**Type:** bool
**Attributes:** read-only, observe

1 = a clip exists in this clip slot.

### has_stop_button

**Type:** bool
**Attributes:** observe

1 = this clip stops its track (or tracks within a Group Track).

### is_group_slot

**Type:** bool
**Attributes:** read-only

1 = this clip slot is a Group Track slot.

### is_playing

**Type:** bool
**Attributes:** read-only

1 = playing_status != 0, otherwise 0.

### is_recording

**Type:** bool
**Attributes:** read-only

1 = playing_status == 2, otherwise 0.

### is_triggered

**Type:** bool
**Attributes:** read-only, observe

1 = clip slot button (Clip Launch, Clip Stop or Clip Record) or button of contained clip are blinking.

### playing_status

**Type:** int
**Attributes:** read-only, observe

0 = all clips in tracks within a Group Track stopped or all tracks within a Group Track are empty.
1 = at least one clip in a track within a Group Track is playing.
2 = at least one clip in a track within a Group Track is playing or recording.
Equals 0 if this is not a clip slot of a Group Track.

### will_record_on_start

**Type:** bool
**Attributes:** read-only

1 = clip slot will record on start.

## Functions

### create_audio_clip

Parameter: `path`
Given an absolute path to a valid audio file in a supported format, creates an audio clip that references the file in the clip slot. Throws an error if the clip slot doesn't belong to an audio track or if the track is frozen.

### create_clip

Parameter: `length`
Length is given in beats and must be a greater value than 0.0. Can only be called on empty clip slots in MIDI tracks.

### delete_clip

Deletes the contained clip.

### duplicate_clip_to

Parameter: `target_clip_slot` [ClipSlot]
Duplicates the slot's clip to the given clip slot, overriding the target clip slot's clip if it's not empty.

### fire

Parameter: `record_length (optional)`
`launch_quantization (optional)`
Fires the clip or triggers the Stop Button, if any. Starts recording if slot is empty and track is armed. Starts recording of armed and empty tracks within a Group Track if Preferences->Launch->Start Recording on Scene Launch is ON. If _record_length_ is provided, the slot will record for the given length in beats. _launch_quantization_ overrides the global quantization if provided.

### set_fire_button_state

Parameter: `state` [bool]
1 = Live simulates pressing of Clip Launch button until the state is set to 0 or until the slot is stopped otherwise.

### stop

Stops playing or recording clips in this track or the tracks within the group, if any. It doesn't matter on which slot of the track you call this function.
