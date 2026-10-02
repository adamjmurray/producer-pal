# MCP Test Clients

Tools for calling the MCP server directly: the `ppal-client` CLI, the debug
`ppal-live-api` tool, and the MCP Inspector. Index: [README.md](README.md).

## CLI Tool

**Purpose:** Direct MCP server interaction for end-to-end testing. Claude Code
should use this to verify changes work correctly before considering tasks
complete.

### Basic Commands

```bash
# Show server info (default)
node scripts/ppal-client.ts

# List available tools
node scripts/ppal-client.ts tools/list

# Call a tool with JSON arguments
node scripts/ppal-client.ts tools/call ppal-read-live-set '{}'
node scripts/ppal-client.ts tools/call ppal-duplicate '{"type": "scene", "id": "7", "destination": "arrangement", "arrangementStart": "5|1"}'

# Use a different server URL
node scripts/ppal-client.ts http://localhost:6274/mcp tools/list

# Show help
node scripts/ppal-client.ts --help
```

### Testing Workflow

Claude Code should use the CLI tool to:

1. Verify tool implementations work correctly
2. Test edge cases with specific arguments
3. Validate state changes in Live
4. Ensure error handling works as expected

**Important:** Always ask for user permission before using the CLI tool to
update state in Ableton Live.

## Live API Tool

Available only in debug builds (`npm run build:debug` or `npm run dev:debug`).

If it's missing from `tools/list`, an e2e run whitelisted it out — see
`e2e/mcp/README.md`, "The direct Live API tool is off during e2e", for how to
POST it back.

### Purpose

Direct Live API access for investigation, debugging, and exploring API behavior.
Claude Code should use this when:

- Investigating unexpected Live API behavior
- Debugging complex state issues
- Exploring undocumented API features
- Verifying assumptions about how the Live API works

Not included in production builds.

### Usage Examples

```bash
# Multiple operation types on live_set tempo
node scripts/ppal-client.ts tools/call ppal-live-api '{
  "path": "live_set",
  "operations": [
    {"type": "get", "property": "tempo"},
    {"type": "getProperty", "property": "tempo"}
  ]
}'

# Explore track properties
node scripts/ppal-client.ts tools/call ppal-live-api '{
  "path": "live_set tracks 0",
  "operations": [
    {"type": "info"},
    {"type": "getChildIds"}
  ]
}'

# Navigate and modify
node scripts/ppal-client.ts tools/call ppal-live-api '{
  "operations": [
    {"type": "goto", "value": "live_set tracks 0"},
    {"type": "set", "property": "name", "value": "My Track"},
    {"type": "get", "property": "name"}
  ]
}'
```

### Operation Types

**Live Object Model:**

- `get` - Get a property's raw value (an array)
- `set` - Set a property value. Always returns 1, even when the write is
  rejected — read the property back to confirm it landed.
- `set_property` - The same write as `set`, but returns the value you sent
- `call` - Call a method on the Live object
- `goto` - Navigate to a new path
- `info` - Get object information
- `getcount` - Count children in a collection
- `getstring` - Read a property as a string

**Extension methods** (normalized values):

- `getProperty` - Get a property, unwrapped to a scalar
- `getChildIds` - Get child object IDs
- `exists` - Check if the object exists. Producer Pal's judgment, not Live's:
  Live's own `valid` field reads 1 for a bad path, a bad index, a bad id, and a
  cleared path, so this checks the object id instead.
- `getColor` - Get color as hex string
- `setColor` - Set color from hex string

**The LiveAPI object itself,** not the Live object it points at:

- `get_property` - Read a JavaScript field (`path`, `id`, `type`, `mode`,
  `valid`, `children`, ...). Not the same as `get`.
- `call_method` - Call a JavaScript method (`getProperty`, `getChildIds`,
  `child`, ...). Not the same as `call`:
  `call_method get_current_beats_song_time` fails, because that method lives on
  the Live object.
- `set_path` - Assign `path`, retargeting the object. `""` clears it.
- `set_mode` - Assign `mode`: `0` follows the path, `1` follows the object. Max
  coerces anything else to 0 or 1.

### Important Limitations

- **Warning location**: When running multiple operations, Live API warnings
  appear at the end without indicating which operation triggered them
- **Debugging tip**: Run operations individually to isolate which operation
  causes warnings
- **Max operations**: 50 operations per tool call to prevent performance issues
- **Full access**: This tool provides unrestricted Live API access - use with
  caution
- **Object lifetime**: every LiveAPI object a tool call builds has its path
  cleared when the call ends, success or failure (see `live-api-release.ts`).
  Live arms a path listener on every collection along a path-based object's path
  and never takes them down, so an unreleased object costs ~5 KB of Ableton log
  on every later structural change to the Live Set, and slows down every later
  LiveAPI creation. Don't add `set_path ""` yourself.

## MCP Inspector

For comprehensive MCP protocol debugging:

```bash
npx @modelcontextprotocol/inspector
```

Then open:
http://localhost:6274/?transport=streamable-http&serverUrl=http://localhost:3350/mcp

Provides:

- Full protocol trace
- Request/response inspection
- Tool testing interface
- Performance metrics

### CORS and the streamable-http transport

The streamable-http URL above is a browser-origin fetch from the inspector UI to
the device's MCP server, so it needs CORS headers on `localhost:3350`. The
server reflects CORS for any localhost origin by default, in every build, so the
inspector (served from a localhost origin) just works — dev or release. Pages
from a non-localhost origin get no CORS headers and are blocked; to reach the
server from one (a remote inspector, or over the LAN), build with
`ALLOW_DEV_BUILD_FLAGS=true ENABLE_REMOTE_CORS=true npm run build` — a plain
`npm run build` refuses every debug flag so one can't reach a release.

The stdio portal is another way in (and it pushes config-override flags to the
device on connect, below):

```bash
npx @modelcontextprotocol/inspector node /absolute/path/to/producer-pal/npm/producer-pal-portal.js
```

The portal is a Node-side stdio→HTTP bridge to `localhost:3350/mcp`, so it
sidesteps CORS entirely (server-to-server fetch, no browser involved). Use an
absolute path — `npx` resolves relative paths against its own cwd.

The portal also accepts config flags: `-s`/`--small-model-mode`,
`-n`/`--notation <value>`, `-f`/`--format <json|compact>`, `-l`/`--live-api`
(enables the opt-in `ppal-live-api` tool), and `--tools <list>` /
`--disable-tools <list>`. Every one rides as a request header, so it reaches
this client only — never the device globals, the chat UI, or another client.
Each has an env var too (`SMALL_MODEL_MODE`, `NOTATION`, `FORMAT`/`JSON_OUTPUT`,
`LIVE_API`, `TOOLS`, `DISABLE_TOOLS`); unlike the enable-only flags, a boolean
env can send `false` to force a setting off, which is what the Claude Desktop
extension's toggles use. Handy for exercising a specific config against a
release build through the inspector.

`--tools` / `--disable-tools` accept tool names and the group aliases in
`src/shared/tool-groups.ts`; `--tools` becomes a local complement over the full
catalog so both feed one header. `--list-tools` prints the group aliases plus a
live `tools/list` from the device (falling back to the portal's own catalog when
it's unreachable, like the bridge does), then exits.
