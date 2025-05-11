# Project Plan

## [Phase 1] Proof-of-concept: Basic MCP Server (outside Max/Live)

Goal: Prove we can build tools in HTTP-based MCP servers and call those tools from Claude Desktop. Learn how to test MCP
servers.

- ✅ Build an "echo" tool in an MCP server using stdio transport (because it's the simplest). Call the tool directly
  from Claude Desktop.
- ✅ Build a "greet" tool in an MCP server using the Streamable HTTP transport. Call it with Claude Desktop via
  `mcp-remote` adaptor.
- ✅ Learn how to use the MCP Inspector.

## [Phase 2] Proof-of-concept: Basic MCP capabilities inside Ableton Live

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

## [Phase 3] Foundation: Comprehensive MCP capabilities

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
  - ✅ set/update normal start/end points and loop start/end points
  - ✅ Allow for MIDI clips to be deleted
  - write clip to nonexistent clip slot auto-creates scenes (up to some limit like 500 or something like that)
- Track CRUD operations:
  - write-track tool
    - ✅ update a track's name, color, mute, solo,and arm state
    - ✅ play a clip in session view
    - ✅ stop playing clips
    - create a new track
  - ✅ read-track, including:
    - ✅ return list of clips (reuse read-clip)
    - ✅ list drum pads in drum racks with their associated ToneLang pitch name (e.g. "C4" instead of 60)
  - ✅ delete-track
- Implement TongLang
  - ✅ notes
  - ✅ sequences
  - ✅ explicit velocity
  - ✅ duration (assuming legato)
    - ✅ floating point duration multipliers
  - ✅ chords
  - ✅ rests
  - ✅ multiple voices
  - ✅ shorthand velocity
  - ✅ modifiers on individual notes on the chord, with overriding behavior
    - should we allow velocity shorthand to stack between note and chord (and let the explicit setting continue to
      override)? Maybe if the code to do this is clean...
  - support articulations (^ makes notes shorter, \_ longer). Default duration could become 75% of the time until the
    next note, then: ^=50%, ^^=25%, ^^^=min(5%, 32nd note), _=100%, _=125%, \_\_\_=200% (or end of next note might be
    interesting)
  - check over whitespace handling, I suspect there are issues
  - address any discrepancies between the spec and grammar
- ✅ Support reading the notes of a clip and outputting in ToneLang syntax
- Improve ToneLang syntax error messages: Claude tried the syntax "D4\*1.5", which should be supported (it is now, but
  wasn't at the time). The error reporting was bad: "Error in create-clip: Expected "R", "[", [ \t\r\n], [0-9],
  [A-Ga-g], or end of input but "." found.". Add tests for having good error message in the syntax.
- BUG: After starting a new voice, rests are not added to offset the voice's start time correctly
- ✅ Add tests, tentatively with vitest
  - ✅ Test all tools
  - ✅ Test ToneLang
  - ✅ Test the MCP server with an MCP client
  - Improve coverage
- ✅ Stop using TypeScript and get things running on Node.js 20 with the built-in version for Node for Max, if possible

## [Phase 4] Deeper Uses Cases

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
- Add another tool for transforming notes in existing MIDI clips? Maybe don't ask the LLM to generate all the notes all
  the time, even with ToneLong, but instead give it access to a features set like some of the MIDI tools. Like
  randomization tools.

## [Phrase 5] Productization and Polish

Goal: Make it easy for other people to use.

- Make a better UI for the Max for Live device
- Make it easy to change the MCP server port
- Pubic documentation
- Blog about it
