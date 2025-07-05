# Ableton Live Composition Assistant - Project Plan

## ✅ Completed Work

**Core Infrastructure:**

- MCP server with StreamableHttp transport integration
- Max for Live device with Node for Max integration
- Live API integration and extensions
- Rollup-based build system with conditional compilation
- Comprehensive test coverage (96.28% overall)
- Device UI with port configuration, status indicators, Claude config display
- Versioning system (needs documentation)
- Desktop extension with graceful fallback when Live isn't running

**Notation System:**

- Custom bar|beat music notation format with notes, sequences, chords
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

### 🏷️ Versioning & Release Process

- [ ] Document the version-bumping process
- [ ] Document the release build process (freezing device, packaging files)
- [ ] Implement version update notifications in the UI
- [ ] Note: Development now occurs in `dev` branch, merged to `main` for
      releases

### 🎨 Branding & Visual Identity

- [ ] Improve Producer Pal logo design
- [ ] Update logo in Desktop Extension
- [ ] Consider overall visual branding consistency

### 🎯 Customization & Adaptive Learning

**Phase 1: Per-Project Context**

- [ ] Add Settings tab to Max device UI
- [ ] Store project context as blob parameter in device
- [ ] Toggle switch for project context
- [ ] Factory Defaults button implementation

**Phase 2: Global Context**

- [ ] Persistent global preferences across projects
- [ ] File system integration for settings storage
- [ ] Popup editor for longer contexts

**Phase 3: JSON Override System**

- [ ] Extract tool descriptions to default-prompts.json
- [ ] Power user customization via prompts.json
- [ ] Version checking with mismatch alerts

**Phase 4: Learning System**

- [ ] Implement learn tool for Claude to update prompts
- [ ] Backup system with automatic rotation
- [ ] History tracking and summaries

**Phase 5: Persona System**

- [ ] Multiple AI personalities for different styles
- [ ] Per-project persona selection

### 🔀 Track Signal Routing

- [ ] Track-to-track MIDI routing functionality
- [ ] Support for duplicating tracks without devices as MIDI sources
- [ ] Enable routing MIDI between tracks for layering
- [ ] Support multiple clips with different lengths for phasing patterns
- [ ] Automatic routing setup for layered loops/patterns
- [ ] UI/UX for routing configuration
- [ ] Note: Prototype already exists in branch

### 🎹 Instrument Selection & Sound Design Assistance

- [ ] Embed Live instrument info into read-song tool
- [ ] Support for user's Live edition (Intro/Standard/Suite)
- [ ] VST/AU plugin list support
- [ ] Contextual instrument recommendations
- [ ] Sound design guidance based on available instruments

### 🧪 R&D: Device & Effect Control

- [ ] Research controlling rack parameters
- [ ] Instrument device parameter control
- [ ] Audio effect parameter manipulation
- [ ] Automation and modulation capabilities

### 🔄 State Synchronization & Robustness

**Phase 1: User Education (Immediate)**

- [ ] Update tool descriptions to guide users about state sync
- [ ] Add refresh instructions when objects move
- [ ] Improve error messages for moved/deleted objects

**Phase 2: Technical Improvements**

- [ ] ID-first operations for all tools
- [ ] Smart error recovery with fallback to IDs
- [ ] Object validation tool
- [ ] Automatic state synchronization (future)

### 🎯 New User Experience (NUX)

**Phase 1: Minimal (Ship Now)**

- [ ] Add movement/sync tip to first read-song

**Phase 2: Safety & Core Features**

- [ ] Welcome message with capabilities overview
- [ ] Save reminder for data safety
- [ ] Basic prompt suggestions

**Phase 3: Progressive Disclosure**

- [ ] Context-aware tips based on Live Set state
- [ ] Error-specific help messages
- [ ] Integration with customization preferences

### 🛠️ Enhanced Features & Quality

**Device Information:**

- [ ] Add device listing to read-track tool
- [ ] Include devices in read-song output
- [ ] Show device types (instrument/audio_effect/midi_effect)

**Arrangement Improvements:**

- [ ] Allow changing clip length (currently requires read/delete/recreate)

**Duplicate Tool:**

- [ ] Response format improvements (see Duplicate Tool Response Format
      Improvement Plan)
- [ ] ClipSlot.duplicate_clip_to with bulk destination support
- [ ] Enhanced clip duplication safety with conflict detection

**Error Handling:**

- [ ] Validation system for better error handling (start/end times, clip bounds)
- [ ] Optional toggle in device UI to suppress Max console errors
- [ ] Standardize exception formats across tools

**Testing:**

- [ ] Improved mocking system with unified interface for LiveAPI objects

### 💡 Future Ideas

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
