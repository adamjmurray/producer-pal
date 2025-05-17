# Ableton Live Composition Assistant - Project Plan

## ✅ Completed Work

### ✅ Phase 1: MCP Server Proof-of-Concept

Successfully demonstrated MCP server functionality with Claude Desktop via:

- Basic tools using stdio transport
- HTTP-based tools via Streamable HTTP transport
- Integration with MCP Inspector

### ✅ Phase 2: Basic Ableton Live Integration

Established core integration between the MCP server and Ableton Live:

- Created Max for Live device with Node for Max integration
- Implemented basic Live API calls to manipulate Ableton objects
- Built foundation for MIDI clip creation and manipulation
- Added support for basic note/chord syntax

### ✅ Phase 3: Comprehensive MCP Capabilities

Completed full feature set for core functionality:

- **ToneLang implementation** - custom music notation with support for:

  - Notes, sequences, and chords
  - Velocity and duration control
  - Multiple voices and rests
  - Modifier overrides

- **Clip operations**:

  - Create, read, update, delete clips
  - Control of clip properties (name, color, looping)
  - Note manipulation with ToneLang
  - Clip playback control

- **Track operations**:

  - Read/write track properties
  - Track creation and deletion
  - Drum pad detection and mapping

- **Live Set operations**:
  - Global transport control
  - Tempo and time signature control
  - Session/arrangement view management

## Upcoming Work

### Phase 4: Deeper Use Cases (in progress)

- **Session and Arrangement integration**:

  - ✅ Auto-create scenes and tracks when needed
  - ✅ Launch scenes for synchronization between tracks
  - ✅ Grouped track support
  - ✅ More intelligent voice handling for drum tracks (read and write with multi-voice syntax)
  - ✅ Support Arranger View
    - ✅ Read Arranger view clips
    - ✅ Upsert Arranger view clips
  - ✅ Delete clip by ID so we can delete from Arranger view
  - ✅ Switch between Session and Arranger view via write-song
    - ✅ Automatically switch views when upserting clips
      - Try to ensure the clip is in view (zoom and/or scroll as needed)
  - ✅ Control of Song.back_to_arranger and Track.back_to_arranger
  - ✅ Duplicate
    - ✅ Clips
    - ✅ Tracks
    - ✅ Scenes
    - ✅ Consolidate all duplicate tools into a single tool
  - ✅ Capture Scene
  - ✅ Add dedicated tools for playback and transport control
    - ✅ Consolidate all playback and transport tools into a single tool
      - Maybe add the ability to simply start or stop the transport without it being associated with arrangement or
        session view (i.e. no automatic view switching)
  - Rework all write-\* tools to only update existing objects when given an id arg, and fail to create via index args if
    something already exists at that location (except in the case of arrangement clips - we can keep blindly overwriting
    those)

- **Robustness improvements**:

  - Validation system for better error handling
    - e.g. start and end time in write-clip
  - ✅ Fix state synchronization issues because playback state immediately after e.g. autoplay in `write-clip` is not
    accurate. This has been addressed by returning optimistic results (originally a sleep() was introduced but
    optimistic results should be a lot more robust)
  - Claude keeps thinking the transport needs to be started to autoplay clips when it's not necessary
  - Add timeouts to promises when calling out to v8 (since if v8 never responds, we will return an error)
  - Revisit stateless server approach. Stateful may be more efficient

- **Feature expansion**:
  - Create improved UI for the Max for Live device
    - Add configuration options (port selection, etc.)
  - ToneLang enhancements
    - Introduce optional bar line markers in ToneLang to ensure notes hit downbeats and semi-recover from LLMs not being
      able to count well e.g. "C3 D3 E3n1t2 F3" would be the same as "C3 D3 E3 | F3" (assuming 4/4 time signature, and
      it will need to be time-signature aware)
    - Introduce a repetition mechanism: (C4 D4 E4)\*2 => C4 D4 E4 C4 D4 E4. It repeats whatever is inside it, including
      bar lines.
      - Maybe this can also be used to set a velocity or duration/time modifier for the group (also also override by
        anything inside, just like with chords)
  - Randomization features:
    - set note probability
    - set note velocity_deviation
    - features to randomize velocities, durations, or start times by some min/max amount when evaluating ToneLang
    - slice & shuffle (rearrange every measure / N beats randomly)

### Phase 5: Productization and Polish

- Create public documentation
- Publish blog posts and examples

## Current Focus

We're in Phase 4, with a focus on deeper integration with Ableton Live's functionality and addressing edge cases in the
current implementation.
