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

### Phase 4: Deeper Use Cases

- **Session and Arrangement integration**:

  - ✅ Auto-create scenes and tracks when needed
  - ✅ Launch scenes for synchronization between tracks
  - ✅ Grouped track support
  - ✅ More intelligent voice handling for drum tracks (read and write with multi-voice syntax)
  - ✅ Support Arranger View
    - ✅ Read Arranger view clips
    - ✅ Upsert Arranger view clips
  - ✅ Delete clip by ID so we can delete from Arranger view
  - ✅ Switch between Session and Arranger view via write-live-set
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
      - Need to clean this up a lot though. Try to remove the old tool files and merge everything into one file (maybe
        multiple functions, like tool-duplicate) and make sure the test coverage is comprehensive. A lot of refactoring
        can be done to e.g. only construct the live set and app view once.
      - Maybe add the ability to simply start or stop the transport without it being associated with arrangement or
        session view (i.e. no automatic view switching)
  - Rework all write-\* tools to only update existing objects when given an id arg, and fail to create via index args if
    something already exists at that location (except in the case of arrangement clips - we can keep blindly overwriting
    those)
  - Maybe rename trigger in write-clip back to autoplay. It's not a big deal, but I asked for a clip to be played and it
    used write-clip with trigger: true when I would have wanted it to use the transport tool

- **Robustness improvements**:

  - Validation system for better error handling
    - e.g. start and end time in write-clip
  - Fix state synchronization issues
    - ✅ playback state immediately after updating in `write-live-set` is not accurate
    - This should be better now, but I notice calling stopAllClips on a track doesn't update triggered or playing state
      in a reasonable amount of time. Here's a thought: maybe firedSlotIndex works ok when firing a new slot? Check on
      that and maybe split off a stopAllClips arg, but call that one stopAllClipsAsync and make it clear the return
      value will not yet reflect the updated state. Maybe we can return a special property in the response like
      `stopping: true` to reinforce things. Or just like and overwrite all clip data to say they are not triggered or
      playing.
    - I now want to fix this by simplifying the tools using optimistic responses. Ideally we never have to sleep() and
      we should try to delete that function.
  - Claude keeps thinking the transport needs to be started to play the clips when it's not necessary
  - Add timeouts to promises when calling out to v8 (since if v8 never responds, we will return an error)
  - Revisit stateless server approach. Stateful may be more efficient

- **Feature expansion**:
  - Create improved UI for the Max for Live device
    - Add configuration options (port selection, etc.)
  - Introduce optional bar line markers in ToneLang to ensure notes hit downbeats and semi-recover from LLMs not being
    able to count well e.g. "C3 D3 E3n1t2 F3" would be the same as "C3 D3 E3 | F3" (assuming 4/4 time signature, and it
    will need to be time-signature aware)
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
