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

## Dumping a Live Set

`scripts/live-api/dump-live-set/` records a running Set's structure as JSON. The
checked-in result is `src/test/fixtures/live-set-dump.json.gz`, loaded by
`loadLiveSetDump()` beside it.

```bash
node scripts/live-api/dump-live-set/dump-live-set.ts dev/scratch.json
node scripts/live-api/dump-live-set/dump-live-set.ts dev/scratch.json --skip=parameters

# regenerate the committed fixture
node scripts/live-api/dump-live-set/dump-live-set.ts \
  src/test/fixtures/live-set-dump.json --gzip --max-objects=200000 \
  --root=live_set --root=this_device --root=live_app
```

Keep all three roots. Tools resolve `this_device` and `live_app` directly, and a
`live_set`-only walk records neither — `this_device` alone is resolved 20 times
by one `read-live-set` call. They cost 2 objects.

`--max-objects` defaults to 20000, which a Set with a few drum racks blows
through — check `meta.truncated` rather than trusting a dump that stopped early.

Needs Live running with the device loaded and the `ppal-live-api` tool available
(a `build:debug` build, or the Setup tab toggle). It only reads.

Each object holds the raw `get()` result for **every** property its own `info`
names — not only the ones the tools read today. A fixture recording just today's
reads goes stale silently: the walk a tool does stops early against it, the
count comes out low, and the budget test passes for the wrong reason.

`info` is read **per object**, never cached by class or path shape. Live answers
differently object by object: a Drum Rack and an Instrument Rack are both
`RackDevice` at the same path shape, and only the Drum Rack lists `drum_pads`.
Sharing a listing across a shape cost a real 128-pad Drum Rack every one of its
pads and reported nothing wrong. Identical listings still share one `types`
entry; a class that answers more than one way gets an entry per answer, labelled
with a path where it was seen, and objects name theirs in `typeKey`.

Objects are recorded under the path **Live** reports, not the one the walk asked
for. Live canonicalizes: it answers `live_set tracks 0 clip_slots 0` for a slot
reached through a scene. Keying by what was asked filed 96 clip slots under
`live_set scenes N clip_slots M`, and an arrangement clip under
`live_set view detail_clip`. Every other spelling becomes an `aliases` entry.
`canonical_parent` is the exception: its value is recorded but it is never
followed, or every object in the Set would gain an alias nothing builds.

Absolute filesystem paths are replaced unless `--keep-paths` is passed, so a
dump doesn't name the machine it came from or the samples on it.

Device parameters are most of the objects in a Set full of instruments — 90% of
the committed fixture. `--skip=parameters` shrinks the dump an order of
magnitude and makes `read-device` budgets meaningless; the summary's per-type
counts say what you would be dropping. `--gzip` is the better answer to size: it
takes 13 MB of JSON down to ~740 KB, which costs 40ms to load and keeps every
parameter. Slimming the parameter property bags instead is not worth it — the
bulk is 26k long path keys, not the values.

The Set behind the fixture is deliberately extreme, because the point is to
measure against shapes a real Set produces rather than shapes a mock happens to
cover: four drum racks (512 pads, 107 populated), an instrument rack nested four
levels deep, six rack return chains, take lanes, deactivated devices, and both
session and arrangement clips. Keep the `.als` outside the repo; `meta` records
the Live version a dump came from.

## Counting LiveAPI Objects

Constructing a LiveAPI object is the expensive part (see
`src/live-api-adapter/live-api-release.ts`), so a call that builds the same
object twice pays twice. Pooling can't help a single big call — the free list
refills only when the last scope closes.

The counter lives in `src/live-api-adapter/live-api-build-stats.ts`. Unit tests
run it always; a build only carries it with `ENABLE_BUILD_STATS=true`, and every
other build gets a do-nothing stub in its place.

### Two numbers, and the difference matters

- **Resolved** is how many times the call asked for an object. It depends on the
  tool and the Live Set and nothing else, so this is the number to compare
  against a test.
- **Constructed** is how many of those had to build one. It depends on how full
  the pool was, so it moves run to run and compares to nothing.

Repeats are resolved minus distinct. Targets are grouped by shape — indices
replaced with `*` — so a Set with a target per clip still reports in a few
lines, and the shapes compare directly between a real Set and a fixture.

### In tests

`liveApiBuildStats()` returns the counts for the current test; the global
`beforeEach` resets it. Tests never open a release scope, so the pool stays cold
and every resolution constructs — the count is exactly what the call asked for.

### Against real Ableton

```bash
ENABLE_BUILD_STATS=true npm run build:debug
```

Every tool response then carries a `WARNING: LiveAPI stats: …` line. That line
is also how you know the device is instrumented: **a plain `npm run build`
silently overwrites it**, and nothing else says so.

Run one call at a time. The counters reset once per request, so overlapping
calls mix their counts.

Do this whenever a budget test's fixture changes. A test that counts against the
mock is measuring the mock: a fixture missing a property the tools read makes a
walk stop early and the count comes out low — green, and wrong in the flattering
direction. Only the same call against real Live catches that.

Missing _objects_ mislead the same way. A drum-pads budget test once read 49 on
a fixture listing the 16 pads its kit filled, while real Live read 137 on a kit
of 4 — because a Drum Rack carries a pad for all 128 notes and the fixture
carried none of the empty ones. Give a fixture the objects Live gives it, not
just the ones the test cares about.

### What the counts can't see

The counter finds one kind of waste: the same target resolved more than once. It
is blind to the other kind — distinct objects built once, correctly, and then
thrown away.

Both are worth fixing and only one shows up in the numbers. A `drum-map` read of
a track whose rack holds no drum rack once built 174 objects, returned no drum
map at all, and reported zero repeats. Nearly pure waste, scored clean.

So read a repeat count as a floor, not a ceiling, and compare what a call
returned against what it built.

Fixture shape drives the answer more than size does. A Drum Rack makes the
drum-mode walk _cheaper_, because `containerHasDrumRack()` returns on the first
device with pads — the expensive shape is a rack with no drum rack in it, which
gets recursed through entirely.

### Attributing a count to a call site

The counter says which targets were resolved, not who asked. When the shapes
aren't enough, capture a stack in `recordLiveApiResolve` — but only under
vitest, where frames name source files. A bundled V8 stack names bundle offsets.
Match filenames with `[\w.-]+\.ts`; without the dot, a `foo.def.ts` frame
reports as `def.ts`.

## Timing Tool Calls

`scripts/probes/tool-call-cost-probe.ts` runs one tool call repeatedly and
prints, per call, how long it took and — on an instrumented build — what it
resolved and constructed.

```bash
node scripts/probes/tool-call-cost-probe.ts ppal-read-device \
  '{"path":"t17/d0/c0/d0","include":["*"],"maxDepth":3}' 12
```

Read the two together. Latency alone can't tell a slow tool from one that
rebuilds its objects on every call, and the counts alone can't say whether the
rebuilding costs anything.

**A `constructed` count above zero after the first call means the pool isn't
covering this call**, so every repeat pays construction again — and each
construction registers a context in MxDCore that only a device reload takes
back, so latency climbs and never comes down. The probe says so in its summary.
That is how the free-list ceiling was found to be too low: a deep 64-pad kit
read rebuilt 803 objects a call and went 2.2 s to 5.9 s over twelve calls, where
a ceiling above the call's own size held it flat at 1.2 s.

**Reload the device between runs you mean to compare.** Every call loads it
further, so a second run starts slower for reasons that have nothing to do with
what changed. Reopening the Live Set (`./scripts/open-live-set`) does it.

`scripts/probes/live-api-context-probe.ts` answers the other question — how
latency grows with objects built and paths visited, and which of the two a
slowdown is coming from. Its header explains the arms.

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
