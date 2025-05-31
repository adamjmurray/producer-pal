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
- Note probability support
- Velocity deviation support

**Complete CRUD Operations:**

- Clips: create, read, update, delete with note manipulation and playback control
- Tracks: create, read, update with properties, drum pad detection, grouped track support
- Scenes: create, read, update, capture functionality
- Live Set operations: transport control, tempo/time signature, view switching

**Advanced Features:**

- Session and Arrangement view support
- Track and scene creation (up to a max limit)
- Bulk operations foundation (create/update/delete/play/stop multiple objects)
- Duplicate operations for tracks, scenes, and clips
- Timeout handling and optimistic result strategies
- Comprehensive error handling and validation

**Documentation:**

- Public documentation completed (README, usage examples)
- Complete tool descriptions and MCP integration

## 🎯 MVP Beta Requirements

### Critical Pre-Launch Features

- [ ] Versioning system

**Clip editing:**

- [ ] Add replaceNotes boolean arg for `update-clip`, which can default to true (the current behavior of completely
      replacing all notes) and when set to false, will add/overwrite notes when setting notes

**BarBeat Improvements:**

- [x] Support time signatures other than 4/4 in BarBeat notation
- [ ] Use bar.beat format for all applicable time-related inputs and outputs (arrangement times, clip lengths e.g.
      loopEnd, etc)
  - [x] all timing data returned by read-clip
  - [x] all args for create-clip and update-clip
  - [x] the arrangerStartTime arg in duplicate
  - [x] all applicable args and result properties for transport
  - [ ] manually test thoroughly and fix any issues (generate a manual test plan?)

**Duplicate Tool:**

- [x] Duplicate scene to arranger (all clips in scene → arranger)
- [ ] Duplicating tracks or scenes should return info about any duplicated clips inside of them. Consider updating the
      tool descriptions to indicate clips will be duplicated and will need to be modified with update-clip rather than
      attempting to create-clip. Claude's feedback "duplicate description should mention that it copies all clips and
      explain the workflow for modifying them. create-clip description should explicitly state it fails if a clip
      already exists at that slot. Maybe add a note about using update-clip for modifying duplicated clips"
- [ ] Duplicating tracks or scenes should have the option to duplicate clips or not

**Robustness:**

- [x] Detect and protect the track hosting the MCP server device
- [x] Fix bug: when rounding up to nearest beat for clip length when creating clips, use actual musical beats instead of
      "ableton beats" (quarter notes... so test with 2/2 and 6/8 time sig)
- [x] Don't try to add velocity 0 notes to clips (bar:beat notation supports it, and we want to support it to remove
      notes, but as a quick fix, consider filtering out any velocity 0 notes before calling the LiveAPI to add notes)
- [x] Errors from the Max patch (i.e. any warnings calling the Live API) needs to be captured as "warnings" and returned
      in the tool call results so the LLM can see it and understand why things might not have worked - [ ] This works
      great but I wonder if there should be a toggle switch in the device UI to suppress Max console errors (in case
      there are situations where it's not a problem and confuses the AI... guess we just need to test and find out if
      this is actually needed)
- [ ] Review and refine all tool descriptions for clarity, including BarBeat specification (and maybe rename to
      `bar:beat` and distinguish the time syntax from the wider notation system that uses bar:beat, perhaps `bar:beat`
      implies the time syntax and `bar:beat notation` refers to the MIDI clip representation with the grammar, parser,
      formatter, etc)

## 🌟 Nice-to-Have (Stretch Goals)

**Clip editing:**

- [ ] support `v0` velocity, which will delete any existing note at the given pitch and start time when updating a clip
      with `replaceNotes: false`

**Live API Extensions:**

- [ ] Implement `Live.from(pathOrId)` that handles prepending "id " when needed (this pattern occurs all over the
      codebase). It should detect digits-only strings and prepend id.
- [ ] When setting lots of properties but only when they are not null, maybe we can have an extension like
      `liveApiObj.setValues({live_api_prop_name: maybeNullValue, ...})`
- [ ] Look for other opportunities to refactor recurring patterns of LiveAPI usage

**Arrangement Improvements:**

- [ ] Allow changing the length of a clip, which isn't directly possible, but we can read all the notes, delete and
      recreate the clip, and set all the notes on the new clip

**Duplicate Tool:**

- [ ] ClipSlot.duplicate_clip_to with bulk destination support
- [ ] Duplicate scene to arranger (all clips in scene → arranger) enhancements
  - [ ] Scene duplication should repeat any looping clips for the duration fo the scene (i.e. the max clip length in the
        scene)
  - [ ] Add an optional arg to set the length of the clips in the arrangement (truncating or re-duplicating to "loop" as
        needed) when copying a scene
- [ ] Duplicate clip to arranger enhancements
  - [ ] Add an optional arg to set the length of the clips in the arrangement (truncating or re-duplicating to "loop" as
        needed) when copying a clip
- [ ] Enhance clip duplication safety in duplicate tool:
  - [ ] Add validation to detect when session clip duplication would overwrite existing clips (including with count > 1)
  - [ ] Add onConflict parameter with options: "error" (default), "overwrite", "next-empty", "new-scene"
  - [ ] Implement per-clip conflict resolution for multiple duplicates
  - [ ] For "next-empty" strategy: scan downward to find first empty clip slot. Throw an error for no empty scenes
  - [ ] For "new-scene" strategy: create new scene copying source scene properties (name, color, tempo, timeSignature)
        but no other clips. Only copy up to the allowed max (reuse the constant in create-scene) and throw an error
        during up-front validation when over the Max
  - [ ] Update result format to include newSceneIndex and newSceneId when scenes are created. Handle multiples
  - [ ] Add comprehensive test coverage for all conflict scenarios and strategies

**Robustness:**

- [ ] Validation system for better error handling (start/end times, clip bounds, etc.)
- [ ] Improved error messages and edge case handling

**MIDI Routing:**

- [ ] Implement track-to-track MIDI routing functionality
- [ ] Support automatic routing setup for layered loops/patterns (e.g. multiple drum patterns with different loop
      lengths)

**Testing Infra:**

- [ ] Improved mocking system. The way we mock liveAPI.get() calls is pretty good. We need similar treatment for ids and
      paths, ideally through some unified interface (i.e. you shouldn't have to mock get, id, and path separately, just
      call a single mock function, which should maybe handle mock calls as well). Also improve how we do expectations on
      mocks. Specifically, the way we check the Nth call so we can than compare the Nth liveApi.path, etc to check the
      call occurred on the right object.

## 🚀 Post-MVP (Future Releases, Tentative)

**BarBeat Enhancements:**

- Percussion notation features (`X...x...` for 16th notes with accents)

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
