# Ableton Live Composition Assistant - Project Plan

## ✅ Completed Work

**Core Infrastructure:**

- MCP server with StreamableHttp transport integration
- Max for Live device with Node for Max integration
- Live API integration and extensions
- Rollup-based build system with conditional compilation
- Comprehensive test coverage (96.28% overall)
- Device UI with port configuration, status indicators, Claude config display
- Versioning system

**Notation System:**

- Custom bar|beat music notation format with notes, sequences, chords
- Velocity and duration control with probability support
- Parser/formatter with PEG grammar
- Time signature support beyond 4/4
- Integration with all clip operations using bar|beat format throughout

**Complete CRUD Operations:**

- **Clips**: create, read, update, delete with note manipulation, playback
  control, incremental editing support
- **Tracks**: create, read, update with properties, drum pad detection, grouped
  track support
- **Scenes**: create, read, update, capture functionality
- **Live Set**: transport control, tempo/time signature, view switching

**Advanced Features:**

- Session and Arrangement view support with comprehensive duplication
  capabilities
- Bulk operations (create/update/delete/play/stop multiple objects)
- Duplicate operations for tracks, scenes, and clips with arrangement
  integration
- Scene-to-arrangement and clip-to-arrangement duplication with configurable
  length control
- Track hosting detection and protection
- Timeout handling and optimistic result strategies
- Comprehensive error handling, validation, and Max console error capture
- Refactored codebase with utility functions for common patterns

**Documentation:**

- Public documentation (README, usage examples)
- Complete tool descriptions and MCP integration guides
- Architecture specifications and refactoring documentation

## 📋 TODOs

**Desktop extension:**

- [ ] Make it gracefully recover from the Max for Live device not being
      reachable. Maybe always support listTools by building the
      create-mcp-server code with rollup and packaging up in the extension, then
      when callingTools, return an error with helpful info like a link to get
      help installing the Max for Live device. Also let people know they need to
      be using Ableton Live 12.2 or higher.
- [ ] Add some screenshots

**Song tool improvements:**

- [x] allow clips to be selected by setting the song_view detail_clip property
- [x] don't return scale properties in read-song or update-song if the scale is
      disabled, as this causes the LLM to follow the scale anyway
- [x] change to detail clip view in update-song
  - [ ] also add ability to hide detail clip view?

**Versioning:**

- [ ] Indicate when new versions are available and link to the download

**Clip editing:**

- [x] Support `v0` velocity to delete existing notes when updating with
      `clearExistingNotes: false`

**Arrangement Improvements:**

- [ ] Allow changing clip length (currently requires read/delete/recreate
      workflow)

**Duplicate Tool:**

- [ ] Response format improvements (see Duplicate Tool Response Format
      Improvement Plan)
- [ ] ClipSlot.duplicate_clip_to with bulk destination support
- [ ] Enhanced clip duplication safety with conflict detection and resolution
      strategies

**Robustness:**

- [ ] Validation system for better error handling (start/end times, clip bounds,
      etc.)
- [ ] Optional toggle in device UI to suppress Max console errors

**MIDI Routing:**

- [ ] Track-to-track MIDI routing functionality
- [ ] Automatic routing setup for layered loops/patterns

**Error Handling:**

- [ ] Standardize exception formats across tools and let exception handler add
      tool names

**Testing Infrastructure:**

- [ ] Improved mocking system with unified interface for LiveAPI objects

## 🚀 Future Ideas

**bar|beat Enhancements:**

- Percussion notation features (`X...x...` for 16th notes with accents)
- Duration format consistency with bar:beat support for note durations

**Advanced Composition Features:**

- Randomization tools (velocity, timing, shuffle)
- Slice & shuffle tools
- Pattern generation algorithms
- Advanced pattern manipulation
- Auto-arrangement suggestions
- Multi-track composition templates
- Groove and swing enhancements

**Beyond Composition Features:**

- Device and plugin parameter control
- Advanced automation and modulation
- Sample manipulation and warping
- Audio effect integration
