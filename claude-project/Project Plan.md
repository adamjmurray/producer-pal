# Project Plan v1

## Phase 1: Basic MCP Server (outside Max/Live)

Goal: Prove we can build tools in HTTP-based MCP servers and call those tools from Claude Desktop. Learn how to test MCP servers.

- ✅ Build an "echo" tool in an MCP server using stdio transport (because it's the simplest). Call the tool directly from Claude Desktop.
- ✅ Build a "greet" tool in an MCP server using the Streamable HTTP transport. Call it with Claude Desktop via `mcp-remote` adaptor.
- ✅ Learn how to use the MCP Inspector.

## Phase 2: Basic MCP capabilities inside Ableton Live

Goal: Prove we can run HTTP-based MCP servers inside Ableton Live in a Max for Live device using Node for Max. Do preliminary, basic integration with the Live API and confirm we can read and write the state of the Ableton Live Set from Claude Desktop. We will focus on Live's Session View in this phase.

- ✅ Create the Max for Live device shell, bootstrap Node for Max with an entry script that loads our simple MCP "greet" tool from phase 1, and call the custom MCP tool running inside Ableton Live from Claude Desktop
- ✅ Add a basic ability to call the Live API in the Max for Live shell from the previous step. Simply trigger creating a new empty MIDI clip in track 0, clip slot 0 in Live's Session View
- ✅ Allow for the MIDI clip to be created in any existing track or clip slot
- ✅ Expand the ability to create a new empty MIDI clip with notes inside it using a simple syntax for pitches and chords (no control over rhythm yet)
- ✅ Expose the state of the Ableton Live set via additional MCP tools
  - ✅ list all tracks and their clips in Session View (but probably not clip contents)
  - ✅ read the state of a MIDI clip at a given track and clipSlot index
- ✅ Control the rhythm when creating clips. A simple place to start would be the pitch/chord sequence string (same syntax) and add another arg to control the baseDuration in quarter notes (1 = one quarter note).
- Allow for MIDI clips to be optionally overwritten (it should continue to fail by default unless there is an argument `overwrite: true`)
- Allow for MIDI clips to be deleted
- Allow for existing MIDI clips to be updated
- Support Arrangement View

## Phase 3: Cleanup, Stabilization, Testing (establish a strong foundation)

- Stop using TypeScript and get running on Node.js 20 with the built-in version for Node for Max
- ✅ Extract stable elements (like boilerplate MCP server setup) into separate files that don't change often (so we can focus on the in-flux code)
  - Partially done but we should keep refactoring and cleaning up
- Add tests, tentatively with vitest
- When the Node for Max code creates Promises, it should also make them timeout after a little while

## Phase 4: Deeper Ableton Live Integration

Goal: Build towards the desired music composition assistant feature set, working end-to-end in Ableton Live with control from Claude Desktop. We will shift focus to Live's Arrangement View in this phase.

Rough sketch (to be expanded as we make more progress on the previous phase):

- Consider introducing support for [ABC Music Notation Syntax](https://abcwiki.org/abc:syntax) or something similar, so MIDI pitch can be represented by semantic pitch class + octave (such as "C4") instead of raw numbers (such as 60).
- Expand the phase 2 functionality to work in Arrangement View in Live
- Expand on the clip generation capabilities (TBD once we have a working prototype)
- Expand on the clip transformation capabilities (TBD once we have a working prototype)
- Add another tool for transforming notes in existing MIDI clips

## Phrase 5: TBD, pending more brainstorming after progress on the above. Possible focus: additional advanced features, and polish and "productization" of feature built in the previous phases.
