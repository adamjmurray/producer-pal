# Producer Pal Evaluation Plan

## Rating System

- **fail** - Doesn't work, errors, or completely misses the mark
- **ok** - Sorta works but has issues (aim higher than this)
- **good** - Works well, meets expectations
- **great** - Exceeds expectations, excellent use of features, very musical
  results

## Testing Guidelines

- **Always test as a real end user** - no intimate knowledge of internals
- **Never explicitly request bar|beat features** - users don't know what that is
- **Use natural language** - "add fills every 4 bars", not "add notes at 4|1"
- **Rate honestly** - we're trying to find issues and compare LLMs

## Evaluation Tests

### 1. Connection Workflow

- Attempt connection with Ableton not running (should guide user)
- "Connect to Ableton" with Live running

### 2. Empty → 4-Track 8-Bar Beat

"Create a 4-track beat with drums, bass, chords, and lead melody, 8 bars"

### 3. Add Missing Lead

Start with drums/bass/chords setup, ask to "add a lead that fits"

### 4. 64-Bar Drum Loop

"Create a 64-bar drum track"

### 5. Progressive Drum Refinement

Three steps:

1. "Create a 4-bar drum loop with constant hi-hats"
2. "Add fills every 4 bars"
3. "Make some hats skip occasionally"

### 6. Bass Syncopation Evolution

Two steps:

1. "Create a simple bass line on quarter notes"
2. "Make it more syncopated"

### 7. Scene Variation

Start with drum/bass/chords/lead scene, ask "create a variation of the scene"

### 8. Session → Arrangement

"Take these session clips and arrange them into a song structure"

### 9. Playback

- "Play this scene"
- "Play the arrangement from bar 8"

### 10. Duplication

- "Duplicate this bass track"
- "Make another layer for the drums so we can make polyrhythms" - should create
  a track that routes MIDI to the source track

### 11. Memory Read/Write

Write project notes, then later ask "what did I say about X?"

### 12. Deletion

"Delete the last track I created"
