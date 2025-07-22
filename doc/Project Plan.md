# Producer Pal Project Plan

## ✅ Completed Work

**Core Infrastructure:**

- MCP server with StreamableHttp transport integration
- Max for Live device with Node.js (MCP server) and Live API integration
- Device UI with port configuration and status indicators
- Claude Desktop extension with graceful fallback when Live isn't running
- Rollup-based build system
- Comprehensive test coverage (~90% overall)

**Complete CRUD Operations:**

- **Clips**: Full CRUD with note manipulation, playback control, incremental
  editing
- **Tracks**: Full CRUD with properties, drum pad detection, grouped track
  support
- **Scenes**: Full CRUD with capture functionality
- **Live Set**: Transport control, tempo/time signature, view switching

**Notation System:**

- Custom LLM-friendly `bar|beat` music notation format for MIDI clips (parser
  with PEG grammar + custom formatter)
- Velocity and duration control with probability support
- Time signature support beyond 4/4

**Advanced Features:**

- Session and Arrangement view support with comprehensive duplication
- Bulk operations (create/update/delete/play/stop multiple objects)
- Duplicate operations for tracks, scenes, and clips with arrangement
  integration
- Session-to-arrangement duplication with length control

**Robustness Features:**

- Optimistic response strategy to avoid LLM fix-it loops
- Comprehensive error handling
- Max console error capture used to transmit warnings
- Timeouts for overly-long-running operations
- Track Producer Pal host detection and protection

## 📋 Focus Areas & TODOs

### Pre-1.0.0 (Critical Path)

#### 0.9.0

- [x] Open-source the codebase and establish versioned releases

#### 0.9.1

- [x] Welcome message / tips in read-song tool description
- [x] Add device listing to read-song and read-track

#### 0.9.2

- [x] Ability to read and write track I/O routings and monitoring state in the
      `read-song`, `read-track`, and `update-track` tools
- [x] "Route to source" feature for tracks in the `duplicate` tool, for layering
      multiple tracks of MIDI clips routing to the same instrument. It's a
      shortcut for:
  1. duplicate a track with no clips or devices (no devices is required to route
     MIDI output from MIDI tracks)
  2. route the new track's output to the source track
  3. set the source track monitoring to "In" (so the track doesn't have to be
     armed to hear the new tracks)
  4. set the source track input routing type to "No input" (to prevent unwanted
     external input after switching to "In" monitoring)
- [x] Allow MIDI passthrough in the Max for Live device

#### 0.9.3

See `doc/Per Project Context and Tabbed UI Spec.md`

- [x] Tabbed UI for the Max for Live device
- [x] Fix flaw in release process where extension package lock is updated after
      commit for version bump
- [x] Adjust desktop extension param to support full URL and not just port
      number (goal: control machine on same LAN)
- [x] Per-Live-Project Context (Customization Phase 1)
- [x] AI-writable Project Context (Learning Phase 1)
- [x] replace numeric scale intervals with pitch classes in the song tools

#### 0.9.4

- [x] Reframe project context as "Project notes"
- [x] Place limits on project notes size
- [x] Strictly validate all tool inputs
- [x] Fix issues with recoverable errors making it look like Producer Pal is
      disconnected from Live
- [x] Improve Producer Pal logo design
- [x] Disable default verbose debug logging. Add an option to enable verbose
      logging to the device UI and Claude Desktop extension
- [x] Fix timeout issues in larger Live Sets (testing with the Demo Song from
      the Chop and Swing pack that comes with Live 12)
  - [x] Omit clips by default in read-song with new args to optionally load clip
        data in the read-song and the read-track tool
  - [x] Increase default timeout to 30s
    - [ ] And let this timeout be changed in the UI without restarting the
          server
- [x] Prefix all tool names with "ppal-" to disambiguate from other MCP tools
- [ ] Fix "node.script: Error handling response from Max: SyntaxError:
      Unterminated string in JSON at position 32767" when loading arrangement
      clips in the Chop and Swing demo song

#### 0.9.5

- [ ] Add new ppal-init tool to handle the NUX instead of read-song
- [ ] Support comments in bar|beat format (probably #, // and /\* \*/)
- [ ] Combine the include* args for read-song and read-track (and any other
      read-* tools?) to be a single include arg that takes an array of what
      detailed info to include
- [ ] Make verbose logging in Claude Desktop actually work
- [ ] Make demo video and add to README and web site

### 🚀 1.0.0 Release

Stable, documented, user-friendly baseline

### Post-1.0.0

#### 1.x - Miscellaneous Cleanup

_TODO: Split this apart into separate minor or patch releases intermixed with
bigger product features in the 1.x line (see below)_

- [ ] Ability to change arrangement clip length
- [ ] Popup window editor for project notes (probably jweb, with a rich
      text/markdown library)
- [ ] Streamline installation process: Install Claude Desktop extension and have
      the extension install/update the Max for Live device to a standard Live
      User Library location on demand. The MCP proxy in the extension could
      generate an additional tool `install-max-for-live-device` when the
      connection to Ableton Live cannot be established and prompt the user to
      use it. Open questions: how best to handle custom Live Library Locations?
      As a desktop extension parameter or on-the-fly in the AI chat?
- [ ] Implement version update notifications in the UI
- [ ] Improve response format for `duplicate` tool
- [ ] Automatically load detailed data (in read-song, etc) based on complexity
      of the Live Set i.e. the number of Live API calls needed
- [ ] Improved mocking system with unified interface for LiveAPI objects
- [ ] State Sync: ID-first operations, smart error recovery (see doc/Better
      State Sync Plan.md)
- [ ] Fix the duplicate track name issues in duplicate.routeToSource (see
      dedicated md file in docs explaining the issue and potential solutions)

#### 1.1.0 - Customization

- [ ] Customization Phase 2: Global context
- [ ] Customization Phase 3: JSON override system

#### 1.5.0 - Device Control

- [ ] Randomize instrument rack macros
- [ ] Rack variation control (store, load, delete)
- [ ] List device parameters
- [ ] Change device parameters

#### 2.0.0 - Learning & Personas

- [ ] Customization Phase 4: Learning system with backups

#### 2.1.0 - Personas

- [ ] Customization Phase 5: Persona system

## 💡 Future Ideas

For 3.x or to pull into one of the above releases when ideas become more fully
baked.

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
