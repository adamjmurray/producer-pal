# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Producer Pal is an AI-powered music composition tool that integrates with
Ableton Live through a Max for Live device. It uses the Model Context Protocol
(MCP) to enable AI assistants to manipulate music in Ableton Live.

## Essential Commands

```bash
# Build the project (required after changes)
npm run build

# Development mode with auto-rebuild (includes raw-live-api tool)
npm run dev

# Build with all tools including raw-live-api
npm run build:all

# Run tests
npm test
npm run test:watch      # Watch mode for TDD
npm run test:coverage   # Coverage report

# Code formatting
npm run format          # Format all files with Prettier
npm run format:check    # Check if files are properly formatted

# Parser commands (when modifying bar|beat grammar)
npm run parser:build    # Rebuild parser from .peggy file
npm run parser:watch    # Auto-rebuild parser
```

### Build Warnings

The build process shows circular dependency warnings from `zod-to-json-schema`.
These are harmless and can be ignored - they come from the MCP SDK's
dependencies and don't affect functionality.

## Architecture

The system follows this communication flow:

```
Claude Desktop → Desktop Extension Bridge → MCP Server (Node.js) → Max for Live Device → Live API
```

### Key Components

1. **Desktop Extension Bridge** (`src/desktop-extension/main.js`): Stdio-to-HTTP
   bridge with graceful fallback when Producer Pal is not running
2. **MCP Server** (`src/mcp-server.js`): HTTP endpoint for MCP communication,
   runs in Node for Max
3. **Tool Implementations** (`src/tools/*.js`): Core logic for each operation
4. **Live API Bridge** (`src/main.js`): V8 JavaScript that receives messages and
   calls Live API
5. **bar|beat Notation** (`src/notation/barbeat/*`): Musical notation parser and
   utilities

### Desktop Extension Robustness

The desktop extension bridge provides graceful fallback when Producer Pal is not
accessible:

- **Online mode**: Forwards all requests to HTTP MCP server in Ableton Live
- **Offline mode**: Returns static tool definitions and helpful setup messages
- **Tool listing**: Always works via fallback definitions from
  `create-mcp-server`
- **Tool calls**: Return setup instructions pointing users to
  https://adammurray.link/producer-pal

**Critical implementation details**:

- Tool names must match regex `^[a-zA-Z0-9_-]{1,64}$` (use original `name`, not
  display name)
- Fallback schemas must be JSON Schema, not Zod objects (use
  `zodToJsonSchema()`)
- Zero runtime dependencies achieved by replacing OAuth imports with stub
  functions

### Message Protocol

Communication between Node.js and V8 uses:

```javascript
// Request: ["mcp_request", JSON.stringify({requestId, tool, args})]
// Response: ["mcp_response", JSON.stringify({requestId, result})]
// Error: ["mcp_response", JSON.stringify({requestId, error})]
```

## bar|beat Notation

The project uses a custom notation for musical timing and notes:

```
1|1 v100 t1.0 C3 E3 G3  // C major chord at bar 1, beat 1
1|2 D3                   // D note at bar 1, beat 2
2|1.5 v80 A3             // A note at bar 2, beat 1.5, velocity 80
```

Grammar file: `src/notation/barbeat/barbeat-grammar.peggy`

## Testing Approach

- Test framework: Vitest
- Mock Live API available via `src/mock-live-api.js`
- Tests are colocated with source files (`*.test.js`)
- Run individual test: `npm test -- path/to/file.test.js`

## Live API Extensions

The project extends the native Live API with helper methods in
`src/live-api-extensions.js`:

- `exists()`: Check if API object is valid
- `getProperty()`: Get single property value
- `getChildIds()/getChildren()`: Get child objects
- `getColor()/setColor()`: Handle color conversions

## Important Constraints

- Max auto-created 1000 scenes and 100 tracks
- Protected track detection prevents modifying the device's host track
- Default timeout: 15 seconds for Live API calls
- Color format: `#RRGGBB` hex strings
- Time format: `bar|beat` (1-based indexing, bars are integers, beats are
  floating point)
- Velocity 0 notes are filtered out (not sent to Live)
- Drum pad detection: Only supports direct drum racks and drum racks nested as
  the first device in the first chain of an instrument rack

### Musical Beats vs Ableton Beats

**Musical beats** are defined by the time signature denominator:

- 4/4 time signature: quarter note is the musical beat (denominator = 4)
- 6/8 time signature: eighth note is the musical beat (denominator = 8)
- 2/2 time signature: half note is the musical beat (denominator = 2)
- 3/4 time signature: quarter note is the musical beat (denominator = 4)

**Ableton beats** are always quarter notes regardless of time signature. This is
Ableton Live's internal timing unit.

**Conversion**: To convert between musical beats and Ableton beats:

- `abletonBeats = musicalBeats * 4 / timeSigDenominator`
- `musicalBeats = abletonBeats * timeSigDenominator / 4`

For example, in 6/8 time:

- 6 musical beats (eighth notes) = `6 * 4 / 8` = 3 Ableton beats (quarter notes)
- 3 Ableton beats = `3 * 8 / 4` = 6 musical beats (eighth notes)

## Tool Pattern

All tools follow this structure:

1. Validate inputs
2. Access Live API objects via path
3. Perform operations
4. Return structured results with consistent format

Example tool structure:

```javascript
export default function toolName(liveApi, args) {
  // Validation
  if (!args.requiredParam) throw new Error("Missing required parameter");

  // API access
  liveApi.goto("path/to/object");
  if (!liveApi.exists()) throw new Error("Object not found");

  // Operations
  const result = liveApi.getProperty("property_name");

  // Return
  return { data: result };
}
```

## Development Workflow

1. Make changes to tools or server code
2. Run `npm run build` or use `npm run dev` for auto-rebuild
3. Test changes with `npm test`
4. Debug using MCP Inspector at `http://localhost:6274`

When modifying bar|beat notation grammar, remember to rebuild the parser with
`npm run parser:build`.

**Important for Manual Testing**: After changing tool descriptions (like in
`src/mcp-server/add-tool-*.js`), you must toggle the Producer Pal extension
off/on in Claude Desktop to refresh the cached tool definitions. Simply saving
code, rebuilding, or restarting Claude Desktop is not sufficient - the extension
must be disabled and re-enabled to see updated tool descriptions.

Note: You generally don't need to run `npm run build` to verify changes - the
test suite is sufficient to ensure correctness.

### End-to-End Testing

For real-world testing and debugging, the `tools/cli.mjs` tool can connect
directly to the MCP server running in Ableton Live:

```bash
# Show server info (default)
node tools/cli.mjs

# List available tools
node tools/cli.mjs tools/list

# Call a tool with JSON arguments
node tools/cli.mjs tools/call read-song '{}'
node tools/cli.mjs tools/call duplicate '{"type": "scene", "id": "7", "destination": "arrangement", "arrangementStartTime": "5|1"}'
```

**IMPORTANT:** ALWAYS ask the user for permission before using the CLI tool to
update state in Ableton Live.

#### Testing the Desktop Extension

For testing the desktop extension's stdio-HTTP bridge without requiring Claude
Desktop installation, use the `tools/test-desktop-extension.mjs` script:

```bash
# Basic bridge test (initialize + tools/list)
node tools/test-desktop-extension.mjs

# Test specific tool without arguments
node tools/test-desktop-extension.mjs read-song

# Test tool with arguments
node tools/test-desktop-extension.mjs read-track '{"trackIndex": 0}'

# Test with custom HTTP URL
node tools/test-desktop-extension.mjs http://localhost:3350/mcp read-song

# Show usage help
node tools/test-desktop-extension.mjs --help
```

This script simulates Claude Desktop's MCP protocol communication by:

1. Starting the stdio-HTTP bridge process
2. Sending MCP protocol messages (initialize, tools/list, tools/call)
3. Parsing and validating responses
4. Providing clean output with timing information

The test provides fast feedback during development without requiring manual
installation and testing through Claude Desktop.

**IMPORTANT:** ALWAYS ask the user for permission before using the desktop
extension testing tool to update state in Ableton Live.

### Raw Live API Tool

For development and debugging, a `raw-live-api` tool is available when building
with `npm run dev` or `npm run build:all`. This tool provides direct access to
the Live API for research and debugging purposes:

```bash
# Example: Multiple operation types on live_set tempo
node tools/cli.mjs tools/call raw-live-api '{
  "path": "live_set",
  "operations": [
    {"type": "get", "property": "tempo"},
    {"type": "getProperty", "property": "tempo"}
  ]
}'
```

The tool supports 13 operation types:

- **Core operations**: `get_property`, `set_property`, `call_method`
- **Convenience shortcuts**: `get`, `set`, `call`, `goto`, `info`
- **Extension methods**: `getProperty`, `getChildIds`, `exists`, `getColor`,
  `setColor`

**Note**: When running multiple operations, warnings appear at the end without
indicating which operation triggered them - this is a limitation of the Live
API.

## Versioning

The project uses semantic versioning (major.minor.patch) maintained in
`src/version.js`. The version is:

- Displayed in server startup logs
- Sent to the MCP SDK as the server version
- Output to Max via `Max.outlet("version", VERSION)` for display in the device

Currently at v0.9.x, working towards the 1.0.0 release.

To update the version:

1. Edit `src/version.js` and update the `VERSION` constant
2. Run `npm run build` to rebuild with the new version

## Project Rules

- At the end of a block of work (e.g. the end of a TODO list), the code should
  be formatted with `npm run format`
- At the end of a block of work (e.g. the end of a TODO list), the full test
  suite `npm test` should be run
- Minimize dependencies to reduce complexity and maintenance
- Ideally we always have comprehensive test coverage, so tests should always be
  written or adjusted for changes to the code. Don't go overboard with every
  possible combination of edge cases because too many tests are a maintenance
  burden. Strive for tight focused tests that exercise core logic at least once
  in an easy to understand way.
- The only programming language we use is JavaScript because of constraints of
  running in an embedded environment. We are using the MCP TypeScript SDK, but
  our code must be JavaScript.
- We are using the 2025-03-26 version of the model context protocol (MCP).
- The primary UI for interacting with the AI will be the Claude Desktop app,
  with hopefully more client support in the future
- All functionality within Live is provided by a single Max for Live device
- We use the new StreamableHttp transport for MCP because the
  [SSE transport is deprecated](https://github.com/modelcontextprotocol/typescript-sdk?tab=readme-ov-file#backwards-compatibility).
- Claude Desktop requires an adapter between its stdio transport and an HTTP MCP
  server. We implement this with our own custom desktop extension bridge.
- We are using Live 12.2 and Max 9
- We are using Node.js 20
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
- **Source file path comments**: All source files in `src/**` and `tools/**`
  must always include the relative path to the file in a comment on the first
  line (or second line after a shebang for executable files). This rule ensures
  that when files are copied to the Claude Project with flattened names like
  `src--tools--create-clip.js`, Claude can understand the original file
  structure, relationships between files, and import dependencies. Examples:
  - `src/main.js` → first line: `// src/main.js`
  - `tools/cli.mjs` → second line: `// tools/cli.mjs` (after
    `#!/usr/bin/env node`)
  - `src/tools/duplicate.js` → first line: `// src/tools/duplicate.js`
- **Explicit file extensions in imports**: All import statements must include
  explicit file extensions (typically `.js`). This is required by Node.js ES
  module resolution when running scripts directly with `node`, even though
  rollup doesn't require it. Examples:
  - `import { createMcpServer } from "../src/mcp-server/create-mcp-server.js"`
  - `import * as console from "./console.js"`
  - `import { VERSION } from "./version.js"`
- Keep code commenting to a minimum
- The Max for Live device is in
  `/Users/adammurray/workspace/ableton-live-composition-assistant/device`. The
  two JavaScript bundles build to this folder.
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
- Use ES6 object shorthand property syntax when possible. Prefer
  `{ name, color }` over `{ name: name, color: color }` when the property name
  and variable name are the same.
- In tests, liveApiId.mockImplementation() and liveApiPath.mockImplementation()
  implementations should always return this.\_id and this.\_path as the default
  after adding any custom behaviors in order to ensure correct expectations on
  live object mocks' `id` and `path` properties
  - `liveApiId.mockImplementation(function () {` and
    `liveApiPath.mockImplementation(function () {` need to be used instead of
    anonymous functions because we need `this` to be correct in the context of
    the callback so we can return the `this._id` and `this._path` default
    values.
- In tests, to best ensure correctness with the LiveAPI, all
  `expect(liveApiCall)` and `expect(liveApiSet)` calls should not use
  toHaveBeenCalledWith() or toHaveBeenNthCalledWith() but instead use
  toHaveBeenCalledWithThis() or toHaveBeenNthCalledWithThis() where the first
  `this` arg matcher is expect.objectContaining({...}) with typically an `id` or
  `path` property depending on the test
  - if you have trouble using `id `for the `this` expectation, try using `path`,
    or vice versa. Avoid using `_id` or `_path` if possible.
  - IMPORTANT: When this matcher fails it will tell you there's an object with
    `_id` or `_path` properties. Don't match on these, match on `id` or `path`.
    Sometimes these don't match because `id` and `path` can be overwritten by
    mock implementations, which is the whole point of the mocking system. In
    these cases you should be able to assert based on the mock setup earlier in
    the test. If it is not working, it is almost certainly because a
    `liveApiId.mockImplementation()` or `liveApiPath.mockImplementation()` is
    not returning the correct default value (`this._id` and `this._path`,
    respectively) `_path` in tests that are passing.
  - Do not use `expect.anything()` for LiveAPI mock expectations, except:
    instead of `.not.toHaveBeenCalledWithThis(expect.anything(), ...)` which
    conceptually does make sense for most negative tests, prefer the simpler
    `.not.toHaveBeenCalledWith(...)`
- If you can't write a test the correct way after a few attempts, and you have
  to compromise, like loosening up a matcher significantly from the original
  plan, leave a TODO comment explaining what happened so we can revisit and try
  again or improve it later.
- When update the playback state of live, like launching clips in Session view,
  updating the state of Live and then immediately reading the state may not
  reflect the state accurately. Previously we introduced sleep() delays to deal
  with this, but that is not ideal and may not work robustly across computers
  with different CPU characteristics. Therefore, for playback-related state, we
  return optimistic results assuming the operation succeeded (e.g. assume a clip
  isTriggered:true when autoplaying it)
- **NEVER use the CLI tool (`tools/cli.mjs`) without explicit permission from
  the user.** The user may be in the middle of their own testing or music
  production work, and running commands could interfere with their Ableton Live
  session or produce unexpected results.

## Desktop Extension (DXT) Rules

- The Desktop Extension manifest is generated from
  `tools/desktop-extension-manifest.template.json` during build
- User configuration (like port) is handled by Claude Desktop, not manual JSON
  editing
- The extension bridge (`claude-ableton-connector.js`) provides graceful
  fallback when Live isn't running
- Test the extension bridge with `node tools/test-desktop-extension.mjs` without
  needing Claude Desktop
- The built `.dxt` file includes the stdio-HTTP bridge bundled with all
  dependencies
- When building releases, both the `.dxt` file AND the frozen Max for Live
  device are needed
