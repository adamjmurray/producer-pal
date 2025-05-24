# Ableton Live Composition Assistant - Project Plan

## ✅ Completed Work

**Core Infrastructure:**

- MCP server with StreamableHttp transport integration
- Max for Live device with Node for Max integration
- Live API integration and extensions
- Rollup-based build system
- Comprehensive test coverage
- Improved device UI with port configuration, status indicators, Claude config display

**Notation System:**

- Custom music notation format with notes, sequences, chords
- Velocity and duration control
- Parser/formatter with PEG grammar
- Integration with all clip operations

**Complete CRUD Operations:**

- Clips: create, read, update, delete with note manipulation and playback control
- Tracks: create, read, update with properties, drum pad detection, grouped track support
- Scenes: create, read, update, capture functionality
- Live Set operations: transport control, tempo/time signature, view switching

**Advanced Features:**

- Session and Arrangement view support
- Track and scene creation (up to a max limit)
- Bulk operations foundation (create/update/delete multiple objects)
- Duplicate operations for tracks, scenes, and clips
- Timeout handling and optimistic result strategies
- Comprehensive error handling and validation

**Documentation:**

- Public documentation completed (README, usage examples)
- Complete tool descriptions and MCP integration

## 🎯 MVP Beta Requirements

### Critical Pre-Launch Features

**Bulk Operations Completion:**

- [ ] `create-clip` - insert multiple clips at specified locations
- [ ] `update-clip` - update multiple clips by ID list
- [ ] Transport bulk operations - play/stop multiple tracks simultaneously

**Additional Duplicate Features:**

- [ ] Duplicate scene to arranger (all clips in scene → arranger)
- [ ] ClipSlot.duplicate_clip_to with bulk destination support

**BarBeat Improvements:**

- [ ] Support time signatures other than 4/4 in BarBeat notation
- [ ] Use bar.beat format for arrangement times, clip lengths, positions

**UX:**

- [ ] `create-clip` and `update-clip` should show the clip in Clip Detail view
- [ ] when changing clip length, Clip Detail view should zoom automatically to show the whole clip
- [ ] when changing the Arrangement, the view should scroll and zoom automatically to show the changes (e.g. where a
      clip was inserted)

**Optimistic Results:**

- [ ] Apply optimistic return strategy to clip note writing (return input notation string instead of normalized form
      from readClip)
- [ ] Audit all tools for consistent optimistic result patterns

**Robustness:**

- [ ] Detect and protect the track hosting the MCP server device
- [ ] When duplicating clips to the session (especially with count > 1) consider warning about clips that would get
      overwritten and consider requiring an `overwrite: true` argument
- [ ] Review and refine all tool descriptions for clarity, including BarBeat specification

## 🌟 Nice-to-Have (Stretch Goals)

**Live API Extensions:**

- [ ] Implement `Live.from(pathOrId)` that handles prepending "id " when needed (this pattern occurs all over the
      codebase)

**MIDI Routing:**

- [ ] Implement track-to-track MIDI routing functionality
- [ ] Support automatic routing setup for layered loops/patterns (e.g. multiple drum patterns with different loop
      lengths)

**BarBeat Enhancements:**

- [ ] Note probability support
- [ ] Velocity deviation/range support

**Robustness:**

- [ ] Validation system for better error handling (start/end times, clip bounds, etc.)
- [ ] Improved error messages and edge case handling

**Testing Infra:**

- [ ] Improved mocking system. The way we mock liveAPI.get() calls is pretty good. We need similar treatment for ids and
      paths, ideally through some unified interface (i.e. you shouldn't have to mock get, id, and path separately, just
      call a single mock function, which should maybe handle mock calls as well). Also improve how we do expectations on
      mocks. Specifically, the way we check the Nth call so we can than compare the Nth liveApi.path, etc to check the
      call occurred on the right object.

## 🚀 Post-MVP (Future Releases)

**BarBeat Enhancements:**

- [ ] Percussion notation features (`X...x...` for 16th notes with accents)

### Advanced Composition Features

- Randomization tools (velocity, timing, shuffle)
- Slice & shuffle tools
- Pattern generation algorithms
- Advanced pattern manipulation
- Auto-arrangement suggestions
- Multi-track composition templates
- Groove and swing enhancements

### Beyond Composition Features

- Device and device/plugin parameter control

## Current Status

**Phase:** MVP Beta Preparation  
**Target:** Complete critical pre-launch features for stable beta release  
**Focus:** Bulk operations, system robustness, and core workflow optimization
