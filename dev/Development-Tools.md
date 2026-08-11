# Development Tools

Essential tools for testing, debugging, and validating Producer Pal
functionality. Claude Code should use these tools to ensure quality and
investigate issues.

## Chat & Eval CLIs

`scripts/chat` (interactive chat against the MCP tools) and `scripts/eval` (run
eval scenarios) select a model with `-m provider/model`. Discover models with
`--list-models <provider>` (lists a provider's models live) or `--list-models`
with no value (lists the providers); listing always prints and exits without
starting a chat or run.

```bash
scripts/chat --list-models            # list providers
scripts/chat --list-models openai     # list one provider's models
scripts/chat -m claude-sonnet-4-5     # start a chat
```

## Skills Snapshots

`npm run skills:snapshot` writes the assembled skills blob for every (toolset
profile × depth × notation) to `dev/skills-snapshots/` (gitignored) and prints a
report: the size of every combination, and which tools keep each fragment.

To see what a fragment reorganization actually did to each caller's
instructions:

```bash
npm run skills:snapshot -- --out /tmp/skills-before   # before your edits
npm run skills:snapshot -- --diff /tmp/skills-before  # after
```

`--diff` prints per-blob size deltas, then the line-level diff.

Profiles live in `scripts/skills/toolset-profiles.ts` — add one when a new use
case matters. The point is to check a carve cheaply, before spending an eval
run.

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
- `set` - Set a property value; returns Live's status code
- `set_property` - The same write as `set`, but returns the value you sent
- `call` - Call a method on the Live object
- `goto` - Navigate to a new path
- `info` - Get object information

**Extension methods** (normalized values):

- `getProperty` - Get a property, unwrapped to a scalar
- `getChildIds` - Get child object IDs
- `exists` - Check if object exists
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
- `getcount` - Count children in a collection
- `getstring` - Read a property as a string

### Important Limitations

- **Warning location**: When running multiple operations, Live API warnings
  appear at the end without indicating which operation triggered them
- **Debugging tip**: Run operations individually to isolate which operation
  causes warnings
- **Max operations**: 50 operations per tool call to prevent performance issues
- **Full access**: This tool provides unrestricted Live API access - use with
  caution
- **Object lifetime**: the tool builds one LiveAPI object per call and clears
  its path when the call ends, success or failure. Live arms a path listener on
  every collection along a path-based object's path and never takes them down,
  so an unreleased object costs ~4,900 bytes of Ableton log on every later
  structural change to the Live Set. Don't add `set_path ""` yourself.

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
from a non-localhost origin get no CORS headers and are blocked; set
`ENABLE_REMOTE_CORS=true` before a build only if you need to reach the server
from one (a remote inspector, or over the LAN).

The stdio portal is another way in (and it pushes config-override flags to the
device on connect, below):

```bash
npx @modelcontextprotocol/inspector node /absolute/path/to/producer-pal/npm/producer-pal-portal.js
```

The portal is a Node-side stdio→HTTP bridge to `localhost:3350/mcp`, so it
sidesteps CORS entirely (server-to-server fetch, no browser involved). Use an
absolute path — `npx` resolves relative paths against its own cwd.

The portal also accepts config-override flags it pushes to the device via
`POST /config` on connect: `-s`/`--small-model-mode`, `-n`/`--notation <value>`,
`-f`/`--format <json|compact>`, and `-l`/`--live-api` (enables the opt-in
`ppal-live-api` tool). Explicit flags always apply. The same settings also have
env vars (`SMALL_MODEL_MODE`, `NOTATION`, `FORMAT`/`JSON_OUTPUT`, `LIVE_API`),
but those are gated behind `ALLOW_CONFIGURATION_OVERRIDES=true` — and, unlike
the enable-only flags, a boolean env can send `false` to force a setting off.
This env path is what the Claude Desktop extension's toggles use. Handy for
exercising a specific config against a release build through the inspector.

`--tools <list>` / `--disable-tools <list>` (env: `TOOLS`, `DISABLE_TOOLS`) are
the exception: they are per client, sent as the disabled-tools header rather
than pushed via `POST /config`, since `config.tools` is device-global. Both
accept tool names and the group aliases in `src/shared/tool-groups.ts`;
`--tools` becomes a local complement over the full catalog so both feed one
header. `--list-tools` prints the group aliases plus a live `tools/list` from
the device (falling back to the portal's own catalog when it's unreachable, like
the bridge does), then exits.

## Build Warnings

### Expected Warnings

Circular dependency warnings from `zod-to-json-schema` are harmless:

```
Circular dependency: node_modules/zod-to-json-schema/...
```

These come from the MCP SDK's dependencies and don't affect functionality.

### Build Validation

After building, verify:

1. `max-for-live-device/mcp-server.mjs` exists and is > 1MB
2. `max-for-live-device/live-api-adapter.js` exists
3. No unexpected errors in build output

## Testing Workflows

### Quick Development Loop

```bash
# Terminal 1: Auto-rebuild
npm run dev

# Terminal 2: Run tests in watch mode
npm run test:watch

# Terminal 3: Test specific functionality
node scripts/ppal-client.ts tools/call ppal-read-live-set '{}'
```

### Full Validation

```bash
# Clean build
npm run clean
npm run build:debug

# Run all tests with coverage
npm run test:coverage
# Console shows summary totals; see coverage/coverage-summary.txt for per-file breakdown
# Or open coverage/index.html for visual report

# Format check
npm run format:check

# Manual testing
node scripts/build-and-release/test-claude-desktop-extension.ts
```

### Reproducible Test Live Sets

The Live Sets in `e2e/live-sets/` and `evals/live-sets/` are reproducible
scenarios for debugging tool behavior with `scripts/ppal-client.ts`. Open one
with `scripts/open-live-set path/to/set.als`. Trace execution with
`console.warn()` (relayed as `WARNING:` in the CLI output — see Max Console
below). After any writes modify the set's state, reopen it with
`scripts/open-live-set` to reset back to the original.

## Debugging Tips

### Enable Verbose Logging

For desktop extension debugging:

```bash
ENABLE_LOGGING=true VERBOSE_LOGGING=true node scripts/build-and-release/test-claude-desktop-extension.ts
```

### Check Log Files

**macOS:**

```bash
tail -f ~/Library/Logs/Producer\ Pal/*.log
```

**Windows:**

```bash
Get-Content "$env:LOCALAPPDATA\ProducerPal\Logs\*.log" -Tail 10 -Wait
```

### Max Console

In Ableton Live, open Max window to see:

- `Max.post()` output
- Error messages
- MCP request/response logging

### Common Issues

**Tool descriptions not updating:**

- Toggle extension off/on in Claude Desktop settings

**Connection timeouts:**

- Check Producer Pal device shows "Running" in Live
- Verify port 3350 is not blocked
- Try reloading the Max device

**State sync issues:**

- Use `ppal-read-live-set` to refresh state
- Check for timing-sensitive operations
- Consider optimistic updates for playback
