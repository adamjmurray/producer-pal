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

- **Notation implementation (BarBeat) ** - custom music notation with support for:

  - Notes, sequences, and chords
  - Velocity and duration control

- **Clip operations**:

  - Create, read, update, delete clips
  - Control of clip properties (name, color, looping)
  - Note manipulation with notation syntax
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

- ✅ **Session and Arrangement integration**:

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

- **Bulk Operations**:

  - split write-\* tools into create and update because it will make bulk operations a lot cleaner
    - ✅ create-track can insert one or more tracks at the given index
    - ✅ update-track can update multiple tracks (with the same property values across each) for a given list of ids
    - ✅ create-scene can insert one or more scenes at the given index
    - ✅ update-scene can update multiple scenes (with the same property values across each) for a given list of ids
    - create-clip can insert one or more clips at the given trackIndex and (starting from?) the given clipSlotIndex
      - lots of open questions: does it fail on slots with clips in them? Should is support an overwrite option? It
        probably shouldn't/can't insert scenes
    - update-clip can update multiple clips (with the same property values across each) for a given list of ids
    - bulk duplicate operations
    - bulk delete options
    - bulk operations in transport:
      - "play-session-clip" action should support a list of comma-separated trackIndex
      - "stop-track-session-clip" action should support a list of comma-separated trackIndex
    - ✅ rename write-song to update-song

- **Robustness improvements**:

  - BarBeat needs to work with time signatures other than 4/4!
  - ✅ Switch over to a rollup based build
  - ✅ Add timeouts to promises when calling out to v8 (since if v8 never responds, we will return an error)
  - ✅ Fix state synchronization issues because playback state immediately after e.g. autoplay in `write-clip` is not
    accurate. This has been addressed by returning optimistic results (originally a sleep() was introduced but
    optimistic results should be a lot more robust)
  - Use bar.beat format for arrangement times, clip lengths, anything that makes sense
  - Consider using optimistic results when writing notes to avoid any confusion about the write not being performed as
    intended and triggering retries (i.e. return the same BarBeat syntax as given, assuming it was valid)
  - Revisit stateless server approach. Stateful may be more efficient
  - Validation system for better error handling
    - e.g. start and end time in write-clip
  - Claude keeps thinking the transport needs to be started to autoplay clips when it's not necessary - is it still an
    issue?
  - Flesh out the mocking system. The way we mock liveAPI.get() calls is pretty good and we need similar treatment for
    ids and paths, ideally through some unified interface (i.e. you shouldn't have to mock get, id, and path separately,
    just call a single mock function, which should maybe handle mock calls as well).
    - Also improve how we do expectations on mocks. Specifically, the way we check the Nth call so we can than compare
      the Nth liveApi.path, etc to check the call occurred on the right object.
  - Formalize some evaluation plans so we can thoroughly manually QA this moving forward. This probably takes the form
    of some example conversations with Claude?

- **Feature expansion**:

  - ✅ Create improved UI for the Max for Live device
    - ✅ Add configuration option for port selection
    - ✅ Make the layout more compact.
      - ✅ Clear indicator "server is running".
      - ✅ Show the port / URL.
      - ✅ Show the claude config
      - ✅ Don't necessarily need to display errors in the device UI, but it needs to be clear the server failed to
        start, and check the Max window for details.
  - Self-awareness of the track the MCP server is hosted in
  - Add ability to route MIDI input from one track into another. Not entirely sure if it's possible, but imagine
    creating a MIDI track and routing it into the main track that e.g. plays drum sounds, and layering loops with
    different lengths. All automatically
    - We should be able to use track routings features to do this. If we want to send multiple MIDI tracks to a single
      track without using a "proxy" track, we probably need to automatically delete all devices in a track in order to
      route MIDI.
  - Notation (BarBeat) enhancements
    - Support note probability
    - Support note velocity_deviation
  - Randomization features (Maybe? Or maybe save "higher level tools" for 2.0):
    - features to randomize velocities, durations, or start times by some min/max amount
    - slice & shuffle (rearrange every measure / N beats randomly)

### Phase 5: Productization and Polish

- Create public documentation
- Publish blog posts and examples

## Current Focus

We're in Phase 4, with a focus on deeper integration with Ableton Live's functionality and addressing edge cases in the
current implementation.
