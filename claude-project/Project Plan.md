# Project Plan

## Phase 1: Basic MCP Server (outside Max/Live)

Goal: Prove we can build tools in HTTP-based MCP servers and call those tools from Claude Desktop. Learn how to test MCP
servers.

- ✅ Build an "echo" tool in an MCP server using stdio transport (because it's the simplest). Call the tool directly
  from Claude Desktop.
- ✅ Build a "greet" tool in an MCP server using the Streamable HTTP transport. Call it with Claude Desktop via
  `mcp-remote` adaptor.
- ✅ Learn how to use the MCP Inspector.

## Phase 2: Basic MCP capabilities inside Ableton Live

Goal: Prove we can run HTTP-based MCP servers inside Ableton Live in a Max for Live device using Node for Max. Do
preliminary, basic integration with the Live API and confirm we can read and write the state of the Ableton Live Set
from Claude Desktop. We will focus on Live's Session View in this phase.

- ✅ Create the Max for Live device shell, bootstrap Node for Max with an entry script that loads our simple MCP "greet"
  tool from phase 1, and call the custom MCP tool running inside Ableton Live from Claude Desktop
- ✅ Add a basic ability to call the Live API in the Max for Live shell from the previous step. Simply trigger creating
  a new empty MIDI clip in track 0, clip slot 0 in Live's Session View
- ✅ Allow for the MIDI clip to be created in any existing track or clip slot
- ✅ Expand the ability to create a new empty MIDI clip with notes inside it using a simple syntax for pitches and
  chords (no control over rhythm yet)
- ✅ Expose the state of the Ableton Live set via additional MCP tools
  - ✅ list all tracks and their clips in Session View (but probably not clip contents)
  - ✅ read the state of a MIDI clip at a given track and clipSlot index
- ✅ Control the rhythm when creating clips. A simple place to start would be the pitch/chord sequence string (same
  syntax) and add another arg to control the baseDuration in quarter notes (1 = one quarter note).

## Phase 3: Establish a strong foundation: Round-out feature set, cleanup/refactor, automated testing

- ✅ Ability to auto-play a clip when creating it
- More clip CRUD operations:
  - ✅ set clip name when creating
  - ✅ set clip looping state when creating
  - ✅ set clip color when creating. Use "CSS syntax" for the MCP interface
  - ✅ update existing clips (tool was repurposed from `create-clip` to the more general `write-clip`)
    - ✅ update name of existing clips
    - ✅ update color of existing clips
    - ✅ update clip mute state
  - ✅ set/updated whether a clip is looping
  - ✅ Allow for notes in existing MIDI clips to be updated. `deleteExistingNotes: true|false` (default false) can be
    used to clear existing clips before setting the new notes.
  - set/update normal start/end points and loop start/end points
  - Allow for MIDI clips to be deleted
- Track CRUD operations:
  - create new tracks
  - update tracks
  - delete tracks
  - set/update track name and color (using "CSS syntax")
- Implement TongLang
  - ✅ support duration (assuming legato)
  - ✅ support rests
  - ✅ support velocity
  - ✅ support floating point duration multipliers
  - support articulations (suggestion: support the reverse of an accent, '<' to lower the velocity, and skip legato
    support for now)
  - ✅ support multiple voices (counterpoint that's not block chords)
  - as support for more features in ToneLang is added, both `write-clip` and `read-clip` need to be updated as well the
    the descriptions of the tools in the `mcp-server`
- ✅ Support reading the notes of a clip and outputting in ToneLang syntax
- Keep refactoring and cleaning things up as needed (~done, very happy with progress here)
- Fix bugs. Current known issues:
  - When there are no more scenes and every slot is full, attempting to create a new clip in a non-existent scene/slot
    gives the misleading "Error in create-clip: Clip slot already has a clip at track 0, clip slot 8". But instead of an
    error, maybe we should auto-add a new scene whenever slotIndex > scene count (but note this may result in the index
    being different if it's much larger than the scene count, so the return value could confirm the index)
  - Claude tried the syntax "D4\*1.5", which should be supported (it is now, but wasn't at the time). The error
    reporting was bad: "Error in create-clip: Expected "R", "[", [ \t\r\n], [0-9], [A-Ga-g], or end of input but "."
    found.". Add tests for having good error message in the syntax.
- Add tests, tentatively with vitest
  - ✅ Test list-tracks
  - ✅ Test create-clip
  - ✅ Test ToneLang
  - We should be able to script the MCP Inspector on the CLI for some end-to-end style testing (kind of like MCP
    Inspector is this project's version of Playwright). Currently it seems the streamable HTTP transport is not yet
    supported (there does not appear to be any way to specify the transport and it is not correctly auto-detected):
    ```
    % npx @modelcontextprotocol/inspector --cli http://localhost:3000 --method tools/list
    Failed to connect to MCP server: SSE error: Non-200 status code (404)
    ```
    We will revisit this soon.
  - Since we can't script the MCP Inspector CLI we could write our own MCP client and test with that
- ✅ Stop using TypeScript and get things running on Node.js 20 with the built-in version for Node for Max, if possible

## Phase 4: Deeper Ableton Live Integration

Goal: Build towards the desired music composition assistant feature set, working end-to-end in Ableton Live with control
from Claude Desktop. We will shift focus to Live's Arrangement View in this phase.

Rough sketch (to be expanded as we make more progress on the previous phase):

- Expand the functionality to work in Arrangement View in Live
- Improve read-clip ToneLang algorithm for multiple voices to be smarter about creating voices from notes close to each
  other in pitch. Consider building support for extending the duration of a note (maybe with ~N syntax) to directly
  support overlapping notes and better represent voices with respect to proper voice leading.
- When the Node for Max code creates Promises, it should also make them timeout after a little while
- Expand on the clip generation capabilities (TBD)
- Expand on the clip transformation capabilities (TBD)
- Add another tool for transforming notes in existing MIDI clips

## Phrase 5: TBD, pending more brainstorming after progress on the above. Possible focus: additional advanced features, and polish and "productization" of feature built in the previous phases.
