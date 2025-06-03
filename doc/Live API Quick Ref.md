# Live API Quick Reference

## Song (live_set)

### Properties

- `tempo` (float) - BPM, 20.0-999.0
- `signature_numerator/denominator` (int) - Time signature
- `is_playing` (bool) - Transport state
- `back_to_arranger` (bool) - 0 = following arrangement
- `loop/loop_start/loop_length` (float) - Arrangement loop
- `scale_name` (string) - Current scale
- `root_note` (int) - 0-11, C=0
- `scale_intervals` (list) - Scale intervals
- `scale_mode` (bool) - Scale mode enabled

### Methods

**Currently Used:**

- `create_scene(index)` - Create scene at index (-1 = end)
- `create_midi_track(index)` / `create_audio_track(index)` - Returns ["id",
  trackId]
- `capture_and_insert_scene()` - Capture playing clips
- `stop_all_clips()` - Stop all session clips
- `start_playing()` / `stop_playing()` - Transport control
- `delete_track(index)` / `delete_scene(index)`
- `duplicate_track(index)` / `duplicate_scene(index)`

**To Implement:**

- `undo()` / `redo()` - Undo/redo operations
- `capture_midi(destination)` - 0=auto, 1=session, 2=arrangement
- `create_return_track()` / `delete_return_track(index)`
- `jump_to_next_cue()` / `jump_to_prev_cue()`
- `tap_tempo()` - Tap to set tempo
- `set_or_delete_cue()` - Toggle cue at playhead
- `move_device(device, target, position)` - Returns actual position

## Track (live_set tracks N)

### Properties

- `name` (string)
- `color` (int) - 0x00RRGGBB format
- `mute/solo/arm` (bool)
- `has_midi_input` (bool) - MIDI vs audio track
- `is_foldable` (bool) - Group track
- `is_grouped` (bool) - Inside a group
- `group_track` (list) - ["id", groupId] or ["id", 0]
- `playing_slot_index` (int) - Currently playing clip slot
- `fired_slot_index` (int) - Triggered clip slot
- `back_to_arranger` (bool) - 0 = following arrangement

### Methods

**Currently Used:**

- `duplicate_clip_slot(index)` - Duplicate to next slot
- `create_midi_clip(start_time, length)` - Returns ["id", clipId]
- `delete_clip(clipId)` - Delete specific clip
- `duplicate_clip_to_arrangement(clipId, time)` - Returns ["id", newClipId]
- `stop_all_clips()` - Stop track's clips

**To Implement:**

- `create_audio_clip(file_path, position)` - Create from audio file
- `delete_device(index)` - Delete device at index

## Scene (live_set scenes N)

### Properties

- `name` (string)
- `color` (int)
- `tempo` (float) - -1 = disabled
- `tempo_enabled` (bool)
- `time_signature_numerator/denominator` (int) - -1 = disabled
- `time_signature_enabled` (bool)
- `is_empty/is_triggered` (bool)

### Methods

- `fire()` - Launch scene

## ClipSlot (live_set tracks N clip_slots M)

### Properties

- `has_clip` (bool)

### Methods

**Currently Used:**

- `create_clip(length)` - Create MIDI clip
- `fire()` - Launch/stop/record

**To Implement:**

- `duplicate_clip_to(target_slot)` - Copy to specific slot
- `create_audio_clip(path)` - Create from audio file

## Clip

### Properties

**Currently Used:**

- `name` (string)
- `color` (int)
- `is_midi_clip/is_audio_clip` (bool)
- `is_arrangement_clip` (bool)
- `signature_numerator/denominator` (int)
- `looping` (bool)
- `start_marker/end_marker` (float) - Beats
- `loop_start/loop_end` (float) - Beats
- `length` (float) - Total length in beats
- `start_time` (float) - Arrangement position
- `is_playing/is_triggered` (bool)

**Audio Only (To Implement):**

- `gain` (float) - 0.0-1.0
- `pitch_coarse` (int) - -48 to 48 semitones
- `pitch_fine` (float) - -50 to 49 cents
- `warp_mode` (int) - 0=Beats, 1=Tones, 2=Texture, 3=Re-Pitch, 4=Complex, 5=REX,
  6=Complex Pro
- `warping` (bool)

### Methods

**Currently Used:**

- `get_notes_extended(from_pitch, pitch_span, from_time, time_span)` - Returns
  JSON
- `add_new_notes({notes: [...]})` - Add MIDI notes
- `remove_notes_extended(from_pitch, pitch_span, from_time, time_span)`

**To Implement:**

- `quantize(grid, amount)` / `quantize_pitch(pitch, grid, amount)`
- `select_all_notes()` / `deselect_all_notes()`
- `select_notes_by_id(list)` - Select specific notes
- `get_selected_notes_extended()` - Get user selection
- `duplicate_notes_by_id({note_ids, destination_time, transposition_amount})`
- `remove_notes_by_id(list)` - Delete specific notes
- `duplicate_region(start, length, destination, pitch, transposition)`
- `crop()` - Trim to loop/markers
- `duplicate_loop()` - Double loop with content

## Note Format

Notes use this structure:

```javascript
{
  note_id: int,          // Unique identifier
  pitch: int,            // MIDI pitch 0-127
  start_time: float,     // Beats from clip start
  duration: float,       // Length in beats
  velocity: float,       // 0-127
  mute: bool,           // Deactivated
  probability: float,    // 0.0-1.0
  velocity_deviation: float,  // Range variation
  release_velocity: float     // Note off velocity
}
```

## Common Patterns

- IDs from children: `get("tracks")` returns `["id", "1", "id", "2", ...]`
- Check existence: `id !== "id 0"`
- Colors: Convert between `0x00RRGGBB` and `#RRGGBB`
- Beats: Bar 1 = beat 0, calculate as `(bar - 1) * beatsPerBar`
