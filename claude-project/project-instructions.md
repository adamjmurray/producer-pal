# AI Music Composition Assistant Project

## Ultimate Goal

Build an AI music composition assistant for Ableton Live by implementing a custom MCP (model context protocol) server
that integrates with the Live API using Max for Live and Node for Max.

## Supporting Goals

### Primary Supporting Goal

Prototype code as directed by the user, to progress towards the ultimate goal.

### Secondary Supporting Goal

Maintain a versioned "Project Plan" markdown artifact for breaking down actionable steps and tracking progress toward
the ultimate goal. This artifact will be persisted to project resources. If the user asks you to open the project plan
for editing, copy the latest version of the project plan resource into the current conversation and increment the
version (either append v2, or increment v2 to v3, etc). Use this version suffix in the artifact name and title.

Similarly, maintain a versioned "Feature List" markdown artifact for feature prioritization and brainstorming (and other
project resources may appear over time that should also use versioned treatment).

## Current Project Phase

We have an end-to-end working prototype where Claude Desktop can call the Live API, and we're starting to build out
features.

We are working through the Project Plan over many conversations. The goal of each conversation is to make progress in
the plan in some very specific way guided by the user. Don't try to solve the whole project at once.

## Context and Constraints:

- Minimize dependencies to reduce complexity and maintenance
- The only programming language we use is JavaScript because of constraints of running in an embedded environment. We
  are using the MCP TypeScript but our code must be JavaScript.
- The repository root is `/Users/adammurray/workspace/ableton-live-composition-assistant`
- The path to the Max for Live device and source code is
  `/Users/adammurray/workspace/ableton-live-composition-assistant/device`
- All code uses CJS modules and must use the older approach of `require()`ing other files
  - All code loaded by the v8 object must be in the same folder (`ableton-live-composition-assistant/device`) and it
    must be required using "./filename.js" isntead of "filename.js". This is because v8 uses it's own custom loader for
    `require`, and it is very limited.
- We are using the 2025-03-26 version of the model context protocol (MCP).
- The UI for interacting with the AI will be the Claude Desktop app
- All functionality within Live should be provided by a single Max for Live device
- We use the new StreamableHttp transport for MCP because the
  [SSE transport is deprecated](https://github.com/modelcontextprotocol/typescript-sdk?tab=readme-ov-file#backwards-compatibility).
- Claude Desktop requires an adapter between its stdio transport and an HTTP MCP server. We use the library `mcp-proxy`
  for this.
- We are using Live 12.2 and Max 9
- We are using Node.js 20
- Keep code commenting to a minimum by default unless something unusual requires explanation. Add more comments to
  resolve confusion or clarify answers to questions.
- When calling the Live API to get properties of an object like a Track or Clip, it seems that single item responses are
  usually (always?) arrays, so we need to do things like `track.get("name")?.[0]` to get the track name as a string. In
  cases where we are trying to compute a boolean, we can rely on JavaScript's type coercion to do things like
  `clip.get("looping") > 0`, but note that `clip.get("looping")` is actually either `[0]` or `[1]` and it's being
  converted to a number.
- source code files must always include the relative path to the file in a comment on the first line, so the context is
  clear when these files are added to project knowledge
- `package.json` must NOT set `"type"`. Setting this to `"module"` breaks the vitest test suite because it needs to
  require CJS code for the v8 object (which contains the tool implementations we are primarily interested in testing).
  Setting this to `"commonjs"` breaks the bootstrapping of the `mcp-server.mjs` module in the Node for Max object, which
  is needed to enable importing with modern style.
- The `.mjs` and (non-test) `.ts` code (i.e. in `device/mcp-server`) is the Node for Max code
- The `.js` and `.test.ts` code is the v8 code (maybe we'll add Node for Max tests at some point too)
- In the Node for Max, log with `Max.post()` calls
- In v8 code, we can use `const console = require("console");` to get a browser console-like logger (with `log()` and
  `error()` functions)
- When requiring other files in the v8 code, we must use `./file.js` instead of `file.js`, otherwise it will not resolve
  correctly in the vitest test suite.
- If you ever notice duplicate files in the project resources, let the user know! This is a mistake and will confuse
  you. We need to fix it proactively when it's detected.
- If you ever notice missing files in the project resources, do not try to infer their contents. Stop and ask if the
  file is missing and should be added to project resources before continuing.
- If all the code is updated, tests pass, but things don't work correctly in an end-to-end test, remember that the Max
  for Live device hosting the MCP server needs to be restarted. The easiest way to do this is delete the device and then
  undo to restore it.

## Trusted online resources:

- Node for Max API docs: https://docs.cycling74.com/apiref/nodeformax/
- Max JS User Guide: https://docs.cycling74.com/userguide/javascript/
- Max JS API: https://docs.cycling74.com/apiref/js/
- Live API Overview: https://docs.cycling74.com/userguide/m4l/live_api_overview/
- Live Object Model: https://docs.cycling74.com/apiref/lom/
- Live Clip API: https://docs.cycling74.com/apiref/lom/clip/
- Live Track API: https://docs.cycling74.com/apiref/lom/track/
- My tutorial on the Live API: https://adammurray.link/max-for-live/v8-in-live/live-api/
- My tutorial on generating MIDI clips: https://adammurray.link/max-for-live/v8-in-live/generating-midi-clips/
- Ableton Live Manual: https://www.ableton.com/en/live-manual/12/
- MCP Documentation: https://modelcontextprotocol.io/
- Peggy Parser Generator Documentation: https://peggyjs.org/documentation.html
