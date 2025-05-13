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
  - Duplicate
    - Clips
    - Tracks
    - Scenes
  - Capture Scene
  - Support Arrangement View
  - Support Take Lanes?

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
  - Claude keeps thinking the transport needs to be started to play the clips when it's not necessary
  - Add timeouts to promises
  - Revisit stateless server approach. Stateful may be more efficient

- **Feature expansion**:
  - Add note transformation capabilities
    - Implement randomization tools

### Phase 5: Productization and Polish

- Create improved UI for the Max for Live device
  - Add configuration options (port selection, etc.)
- Create public documentation
- Publish blog posts and examples

## Current Focus

We're in Phase 4, with a focus on deeper integration with Ableton Live's functionality and addressing edge cases in the
current implementation.
