# AI Music Composition Assistant Project

## Goal

Build an AI music composition assistant for Ableton Live by implementing a custom MCP (model context protocol) server
that integrates with the Live API using Max for Live and Node for Max.

## Current Focus

We have an end-to-end working prototype where Claude Desktop can call the Live API, and we're starting to build out
features.

We are working through the Project Plan over many conversations. The goal of each conversation is to make progress in
the plan in some very specific way guided by the user. Don't try to solve the whole project at once.

## Rules

- Minimize dependencies to reduce complexity and maintenance
- Ideally we always have comprehensive test coverage, so tests should always be written or adjusted for changes to the
  code. Don't go overboard with every possible combination of edge cases because too many tests are a maintenance
  burden. Strive for tight focused tests that exercise core logic at least once in an easy to understand way.
- The only programming language we use is JavaScript because of constraints of running in an embedded environment. We
  are using the MCP TypeScript SDK, but our code must be JavaScript.
- We are using the 2025-03-26 version of the model context protocol (MCP).
- The UI for interacting with the AI will be the Claude Desktop app
- All functionality within Live should be provided by a single Max for Live device
- We use the new StreamableHttp transport for MCP because the
  [SSE transport is deprecated](https://github.com/modelcontextprotocol/typescript-sdk?tab=readme-ov-file#backwards-compatibility).
- Claude Desktop requires an adapter between its stdio transport and an HTTP MCP server. We use the library `mcp-proxy`
  for this.
- We are using Live 12.2 and Max 9
- We are using Node.js 20
- The repository root is `/Users/adammurray/workspace/ableton-live-composition-assistant`
- The path to the Max for Live device and source code is
  `/Users/adammurray/workspace/ableton-live-composition-assistant/device`
- The code is separated into the MCP server that runs on Node.js (via Node for Max) and the JavaScript code that runs in
  the embedded V8 engine (via the Max v8 object).
  - The entry point for the MCP server is `device/mcp-server.mjs`. This imports the code from `device/mcp-server/**`. As
    indicated by the filenames, these are ESM files. They must be ESM so we can mock the `max-api` import in our tests
    for this part of the code base (import mocking is not compatible with CJS).
  - The entry point for the v8 code is `device/main.js`. The Max v8 object does not support ESM, so this code and all
    the code it requires must be CJS. Additionally, it must use a flat folder structure, so all the code is in the
    `device` folder next to `device/main.js`.
  - All the test code for the CJS code must use imports for vitest file watching and auto-rerunning to work
- source code files must always include the relative path to the file in a comment on the first line, so the context is
  clear when these files are added to project knowledge
- Keep code commenting to a minimum by default unless something unusual requires explanation. Add more comments to
  resolve confusion or clarify answers to questions.
- Calling the Live API has idiosyncrasies, such as properties needing to be to be accessed via
  `track.get("propertyName")?.[0]`. To make this less awkward, a cleaner interface is provided in
  `device/live-api-extensions.js`. Use this interface whenever possible.
- `package.json` must NOT set `"type"`. Setting this to `"module"` breaks the vitest test suite because it needs to
  require CJS code for the v8 object (which contains the tool implementations we are primarily interested in testing).
  Setting this to `"commonjs"` breaks the bootstrapping of the `mcp-server.mjs` module in the Node for Max object, which
  is needed to enable importing with modern style.
- In the Node for Max, log with `Max.post()` calls
- In v8 code, we can use `const console = require("console");` to get a browser console-like logger (with `log()` and
  `error()` functions)
- When requiring other files in the v8 code, we must use `./file.js` instead of `file.js`, otherwise it will not resolve
  correctly in the vitest test suite.
- If you ever notice duplicate files in the project resources, let the user know! This is a mistake and will confuse
  you. We need to fix it proactively when it's detected.
- Always `== null` checks instead of `=== null` or `=== undefined` (and similarly for `!= null`). Always use `x ?? y`
  instead of `x === undefined ? y : x` and similar expressions.
- Never default to values inside the ToneLang grammar. The parser should return null or undefined to accurately reflect
  the syntax, and let the parser-calling code interpret the parsed results to set appropriate defaults (because the
  parser-calling code has the needed context and the grammar does not).
- If you ever notice missing files in the project resources, do not try to infer their contents. Stop and ask if the
  file is missing and should be added to project resources before continuing.
- If all the code is updated, tests pass, but things don't work correctly in an end-to-end test, remember that the Max
  for Live device hosting the MCP server needs to be restarted. The easiest way to do this is delete the device and then
  undo to restore it.

## Trusted online resources (if web search is needed to unblock):

- Node for Max API docs: https://docs.cycling74.com/apiref/nodeformax/
- Max JS User Guide: https://docs.cycling74.com/userguide/javascript/
- Max JS API: https://docs.cycling74.com/apiref/js/
- Live API Overview: https://docs.cycling74.com/userguide/m4l/live_api_overview/
- Live Object Model: https://docs.cycling74.com/apiref/lom/
- Live Clip API: https://docs.cycling74.com/apiref/lom/clip/
- Live Track API: https://docs.cycling74.com/apiref/lom/track/
- Tutorial on the Live API: https://adammurray.link/max-for-live/v8-in-live/live-api/
- Tutorial on generating MIDI clips: https://adammurray.link/max-for-live/v8-in-live/generating-midi-clips/
- Ableton Live Manual: https://www.ableton.com/en/live-manual/12/
- MCP Documentation: https://modelcontextprotocol.io/
- Peggy Parser Generator Documentation: https://peggyjs.org/documentation.html
