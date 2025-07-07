# Producer Pal: an AI music production assistant

An AI music production assistant for Ableton Live implemented as a custom MCP
(model context protocol) server that integrates with the Live API using Max for
Live.

## Goal

We are developing the code with Claude Code. This Claude Project is used for
brainstorming and analysis sessions. The code is in project resources.

Most conversations will revolve around discussing how to improve the current
code (adding features, fixing bugs, or improving the general code quality or
test coverage). Because we are in a Claude Project, the outputs will commonly be
technical plans in markdown format to be shared with Claude Code, and we might
generate some code snippets to play around with ideas, which could also be
copied over to Claude Code as appropriate.

## Project Rules

- Minimize dependencies to reduce complexity and maintenance
- Ideally we always have comprehensive test coverage, so tests should always be
  written or adjusted for changes to the code. Don't go overboard with every
  possible combination of edge cases because too many tests are a maintenance
  burden. Strive for tight focused tests that exercise core logic at least once
  in an easy to understand way.
- **Test assertions**: Prefer `expect.objectContaining()` and nested
  array/object matchers over individual property assertions. Write assertions
  that match the expected data structure as closely as possible to make tests
  more maintainable and focused on what matters.
- The only programming language we use is JavaScript because of constraints of
  running in an embedded environment. We are using the MCP TypeScript SDK, but
  our code must be JavaScript.
- We are using the 2025-03-26 version of the model context protocol (MCP).
- The UI for interacting with the AI will be the Claude Desktop app
- All functionality within Live is provided by a single Max for Live device
- We use the new StreamableHttp transport for MCP because the
  [SSE transport is deprecated](https://github.com/modelcontextprotocol/typescript-sdk?tab=readme-ov-file#backwards-compatibility).
- Claude Desktop requires a Desktop Extension to connect to Ableton Live
- The Claude Desktop Extension manifest is generated from
  `tools/desktop-extension-manifest.template.json` during build
- User configuration (like port) is handled by Claude Desktop, not manual JSON
  editing
- The extension bridge (`claude-ableton-connector.js`) provides graceful
  fallback when Live isn't running
- The built `.dxt` file includes the stdio-HTTP bridge bundled with all
  dependencies
- When building releases, both the `.dxt` file AND the frozen Max for Live
  device are needed
- **Manual Testing Note**: After changing tool descriptions in the code, you
  must toggle the Producer Pal extension off/on in Claude Desktop to refresh the
  cached tool definitions
- We are using Live 12.2 and Max 9
- We are using Node.js 20
- The repository root is `/Users/adammurray/workspace/producer-pal`
- The path to the source code is `/Users/adammurray/workspace/producer-pal/src`
- We build two JavaScript bundles with rollup.js. One bundle is for the MCP
  server that runs on Node.js (via Node for Max). The other bundle is the
  JavaScript code that runs in the embedded V8 engine (via the Max v8 object).
  - The entry point for the MCP server is `src/mcp-server.js`. This imports the
    code from `src/mcp-server/**` (note the built file for distribution is
    renamed to `mcp-server.mjs` to ensure `import` can work)
    - The runtime dependencies (@modelcontextprotocol/sdk, express, and zod) are
      bundled along with the source code for easy distribution (so end users
      don't have to install any npm modules)
  - The entry point for the v8 code is `src/main.js`
- source code files must always include the relative path to the file in a
  comment on the first line, so the context is clear when these files are added
  to project knowledge
- Keep code commenting to a minimum
- The Max for Live device is in
  `/Users/adammurray/workspace/producer-pal/device`. The two JavaScript bundles
  build to this folder.
- When defining MCP tool interfaces with zod, avoid using features like
  `z.union()` and `z.array()`. Many features do not currently work correctly
  with the MCP SDK. Stick to primitive types like strings, numbers, and
  booleans, as well as enums of primitive types. For bulk operations, accept a
  string of e.g. comma-separated IDs and parse them in the tool implementation.
- Calling the Live API has idiosyncrasies, such as properties needing to be to
  be accessed via `track.get("propertyName")?.[0]`. To make this less awkward, a
  cleaner interface is provided in `src/live-api-extensions.js`. Use this
  interface whenever possible.
- In the Node for Max, log with `Max.post()` calls
- In v8 code, we can use `import * as console from "./console";` to get a
  browser console-like logger (with `log()` and `error()` functions)
- Prefer `== null` checks instead of `=== null` or `=== undefined` (and
  similarly for `!= null`). Prefer `x ?? y` instead of `x === undefined ? y : x`
  and similar expressions. Occasionally, we really do need to distinguish
  between null and undefined to support optional explicit nulls, and those are
  the only situations we should do things like `=== null` or `=== undefined`.
- When update the playback state of live, like launching clips in Session view,
  updating the state of Live and then immediately reading the state may not
  reflect the state accurately. Previously we introduced sleep() delays to deal
  with this, but that is not ideal and may not work robustly across computers
  with different CPU characteristics. Therefore, for playback-related state, we
  return optimistic results assuming the operation succeeded (e.g. assume a clip
  isTriggered:true when autoplaying it)
- If you ever notice duplicate files in the project resources, let the user
  know! This is a mistake and will confuse you. We need to fix it proactively
  when it's detected.
- If you ever notice missing files in the project resources, do not try to infer
  their contents. Stop and ask if the file is missing and should be added to
  project resources before continuing.
  - Note that the generated parser code (from .peggy grammar files) are not
    included in project resources to save space. The source of truth is the
    grammar(s).

## Trusted online resources (if web search is needed to unblock):

- Node for Max API docs: https://docs.cycling74.com/apiref/nodeformax/
- Max JS User Guide: https://docs.cycling74.com/userguide/javascript/
- Max JS API: https://docs.cycling74.com/apiref/js/
- Live API Overview: https://docs.cycling74.com/userguide/m4l/live_api_overview/
- Live Object Model: https://docs.cycling74.com/apiref/lom/
- Live Clip API: https://docs.cycling74.com/apiref/lom/clip/
- Live Track API: https://docs.cycling74.com/apiref/lom/track/
- Tutorial on the Live API:
  https://adammurray.link/max-for-live/v8-in-live/live-api/
- Tutorial on generating MIDI clips:
  https://adammurray.link/max-for-live/v8-in-live/generating-midi-clips/
- Ableton Live Manual: https://www.ableton.com/en/live-manual/12/
- MCP Documentation: https://modelcontextprotocol.io/
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Claude Desktop Extension: https://github.com/anthropics/dxt
- Peggy Parser Generator Documentation: https://peggyjs.org/documentation.html
- When designing features that involve contextual help, adaptive messaging, or
  user education, prefer adding instructions to tool descriptions over adding
  code complexity. Let Claude's intelligence handle context-aware responses
  rather than encoding rules in JavaScript. Example: The welcome message in
  read-song and missing instrument detection both use tool instructions rather
  than code flags. This pattern is documented in docs/Patterns.md.
