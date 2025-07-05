# Ableton Live Composition Assistant - Project Plan

## ✅ Completed Work

**Core Infrastructure:**

- MCP server with StreamableHttp transport integration
- Max for Live device with Node.js (MCP server) and Live API integration
- Rollup-based build system
- Comprehensive test coverage (~90% overall)
- Device UI with port configuration and status indicators
- Claude Desktop extension with graceful fallback when Live isn't running

**Notation System:**

- Custom bar|beat music notation format for MIDI clips
- Velocity and duration control with probability support
- Parser/formatter with PEG grammar
- Time signature support beyond 4/4
- Integration with all clip operations using bar|beat format throughout

**Complete CRUD Operations:**

- **Clips**: Full CRUD with note manipulation, playback control, incremental
  editing
- **Tracks**: Full CRUD with properties, drum pad detection, grouped track
  support
- **Scenes**: Full CRUD with capture functionality
- **Live Set**: Transport control, tempo/time signature, view switching

**Advanced Features:**

- Session and Arrangement view support with comprehensive duplication
- Bulk operations (create/update/delete/play/stop multiple objects)
- Duplicate operations for tracks, scenes, and clips with arrangement
  integration
- Scene-to-arrangement and clip-to-arrangement duplication with length control
- Track hosting detection and protection
- Timeout handling and optimistic result strategies
- Comprehensive error handling, validation, and Max console error capture
- Refactored codebase with utility functions for common patterns

**Recent Improvements:**

- Clip selection via song_view detail_clip property
- Scale properties excluded when scale is disabled
- Detail clip view switching in update-song
- Support for `v0` velocity to delete notes with incremental updates
- Desktop extension screenshots added

**Documentation:**

- Public documentation (README, usage examples)
- Complete tool descriptions and MCP integration guides
- Architecture specifications and refactoring documentation

## 📋 Focus Areas & TODOs

### Pre-1.0.0 (Critical Path)

#### 0.9.1 - Documentation, NUX & User Education

- [ ] Document the version-bumping process
- [ ] Document the release build process (freezing device, packaging files)
- [ ] Public documentation (README, usage examples)
- [ ] Add link to docs in the Max for Live device UI
- [ ] Ensure Claude will link to docs without hesitation when asked
- [ ] **State Sync Phase 1**: Update tool descriptions with refresh guidance
- [ ] **State Sync Phase 1**: Improve error messages for moved/deleted objects
- [ ] **NUX Phase 1**: Add movement/sync tip to first read-song
- [ ] **NUX Phase 2**: Welcome message with capabilities overview
- [ ] **NUX Phase 2**: Save reminder for data safety
- [ ] **NUX Phase 2**: Basic prompt suggestions
- [ ] **NUX Phase 3**: Context-aware tips based on Live Set state
- [ ] **NUX Phase 3**: Error-specific help messages

#### 0.9.2 - Device Information & Instrument Assistance

- [ ] Add device listing to read-track tool
- [ ] Include devices in read-song output
- [ ] Show device types (instrument/audio_effect/midi_effect)
- [ ] **Stretch Goal**: MVP Instrument Selection & Sound Design Assistance
  - [ ] Embed basic Live instrument info (Suite/Standard/Intro editions)
  - [ ] Have Claude ask about user's VST/AU plugins when relevant
  - [ ] Basic contextual instrument recommendations

#### 0.9.3 - Visual Identity & Track Routing

- [ ] Improve Producer Pal logo design
- [ ] Update logo in Desktop Extension
- [ ] Consider overall visual branding consistency
- [ ] Track Signal Routing (prototype exists)
  - [ ] Support for duplicating tracks without devices as MIDI sources
  - [ ] Enable routing MIDI between tracks for layering
  - [ ] Support multiple clips with different lengths for phasing patterns
  - [ ] Automatic routing setup for layered loops/patterns
  - [ ] UI/UX for routing configuration
- [ ] Arrangement clip length changes

### 🚀 1.0.0 Release

_Stable, documented, user-friendly baseline with device awareness_

### Post-1.0.0

#### 1.0.x - Post-Launch Cleanup

- [ ] Implement version update notifications in the UI
- [ ] Optional toggle in device UI to suppress Max console errors
- [ ] Standardize exception formats across tools
- [ ] Duplicate Tool response format improvements
- [ ] Improved mocking system with unified interface for LiveAPI objects
- [ ] State Sync Phase 2: ID-first operations, smart error recovery
- [ ] Validation system for better error handling

#### 1.1.0 - Customization Foundation

- [ ] Customization Phase 1: Per-project context
- [ ] Customization Phase 2: Global context
- [ ] Customization Phase 3: JSON override system
- [ ] Full Instrument Selection & Sound Design Assistance (beyond MVP)

#### 1.2.0 - Device Control

- [ ] R&D: Device & Effect Control (rack parameters, automation if the Live API
      allows it one day)

#### 2.0.0 - Learning & Personas

- [ ] Customization Phase 4: Learning system with backups

#### 2.1.0 - Personas

- [ ] Customization Phase 5: Persona system

### 💡 Future Ideas (2.x)

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

**Beyond Composition:**

- Sample manipulation and warping
- Advanced automation curves
- MIDI effects integration

## 📚 Related Documents

- Customization and Adaptive Learning Roadmap
- Better State Sync - Phase 1 (User education approach)
- Better State Sync - Phase 2 (Technical automation plan)
- Enhanced NUX (Progressive onboarding strategy)
- Add Device Info (Track device listing feature)
- Duplicate Tool Response Format Improvement Plan
- Manual Testing Scenarios
- Live Instruments (instrument info & sound design ideas)
- Architecture documentation
- bar|beat notation specification
