## Feature Reference

You can simply ask the AI what it can do with Producer Pal / its Ableton Live
tools. For reference, here is a list of all the tools and their features:

### `transport` tool

Controls playback in both Arrangement and Session views via various actions:

- `play-arrangement` - Start arrangement playback from a specified position
- `update-arrangement` - Modify arrangement loop and track follow settings
  without affecting playback
- `play-scene` - Launch all clips in a Session view scene
- `play-session-clip` - Trigger specific clips in Session view
- `stop-track-session-clip` - Stop Session clips in specific tracks
- `stop-all-session-clips` - Stop all Session view clips
- `stop` - Stop all playback

### `read-song` tool

Returns comprehensive Live Set information including:

- Ableton Live version
- Song name
- Current view (Session/Arranger)
- Playback state and tempo
- Time signature
- Scale settings (mode, root note, intervals)
- All tracks with their clips
- All scenes

### `update-song` tool

Updates global song properties:

- Tempo (20-999 BPM)
- Time signature (e.g., "4/4")
- View switching (Session/Arranger)

### `create-scene` tool

Creates scenes at specified index with the given:

- name, color, tempo, and time signature (or follow the song's tempo/time
  signature)

### `read-scene` tool

Retrieves scene information:

- Name, color, tempo, time signature
- Playing/triggered state
- Clip details for all tracks in the scene

### `update-scene` tool

Updates existing scenes:

- Modify name, color, tempo, time signature
- Disable scene tempo/time signature to follow the song's tempo/time signature
- Bulk operations with comma-separated IDs

### `capture-scene` tool

Captures currently playing clips as a new scene below the selected scene.

### `create-track` tool

Creates MIDI or audio tracks:

- Insert at specified index
- Set initial mute/solo/arm states

### `read-track` tool

Returns comprehensive track information:

- Type (MIDI/audio), name, color
- Mute/solo/arm states
- Playing/fired clip indices
- All Session and Arranger clips
- Drum pad information in tracks containing drum racks (so it's known that e.g.
  pitch C1 triggers the 808 kick)

### `update-track` tool

Updates existing tracks by ID:

- Modify name, color, mute/solo/arm states
- Bulk operations with comma-separated IDs

### `create-clip` tool

Creates MIDI clips in Session or Arrangement view:

- Generate MIDI clips with full support for pitch, timing, velocity, velocity
  ranges, and note probability
- Time is represented as bars and beats respecting the current time signature,
  allowing for longer, more complex rhythmic patterns to be handled accurately
- Works with Session and Arranger clips
- Autoplay option for Session clips
- Auto-creates scenes if needed (Session view)
- Sequential placement for multiple clips

### `read-clip` tool

Retrieves clip information:

- Type (MIDI/audio), name, color
- MIDI notes in readable notation format with time represented as bars and beats
- Loop settings
- Works with Session and Arranger clips

### `update-clip` tool

Updates existing clips by ID:

- Update the pitches, timing, velocities, velocity ranges, and note
  probabilities of MIDI clips
- Time is represented as bars and beats respecting the current time signature,
  allowing for longer, more complex rhythmic patterns to be handled accurately
- Modify name and color
- Modify loop setting
- Modify time signature
- Works with Session and Arranger clips
- Bulk operations with comma-separated IDs

### `delete` tool

Deletes objects by ID and type:

- Delete tracks, scenes, or clips
- Bulk deletion with comma-separated IDs

### `duplicate` tool

Duplicates objects with advanced options:

- Tracks: Sequential duplication
- Scenes: To Session or Arranger view
- Clips: To Session slots or Arranger timeline
- Precise timing control for Arranger placement

### Custom Music Notation

All clip and time-related operations support a custom notation format designed
for use by AI.

Pitches are named as they appear in the piano roll, so middle C is "C3", and the
AI understands this. You can spell out note names like C, Eb, F# talk to the AI
about pitches this way.

Time is represented in bar:beat syntax where bars are whole numbers and beats
can have fractions. 1:1 is the start of the song/clip: the first beat of the
first measure. 2:1.5 is the second measures, one half beat past the start of the
measure. The number of beats per measure is determined from the time signature.
Note that every clip can have its own time signature. Arrangement view song
positions are in terms of the song's time signature, and new clips will default
to using the song's time signature.

Generally, you can speak naturally about clip and song positions in terms of
bars and beats, such "add a drum fill at the end of every four bars", or
"generate a new clip in bar 5 of the arrangement". You can also try using the
bear:beat format directly if you want, such as "generate a clip in the
arrangement at 17:2-21:2".
