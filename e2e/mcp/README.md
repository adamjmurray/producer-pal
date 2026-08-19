# MCP Protocol E2E Tests

End-to-end tests that verify Producer Pal tools via the MCP protocol.

## Prerequisites

1. **Build the project**: `npm run build:debug`
2. **Ableton Live installed** (the tests will open it automatically)
3. **Terminal accessibility permissions** (System Settings → Privacy & Security
   → Accessibility → Terminal)

## Running Tests

```bash
# Run MCP e2e tests
npm run e2e:mcp

# Run in watch mode
npm run e2e:mcp:watch
```

### Code execution tests

The `clip/ppal-code-exec.test.ts` suite exercises the sandboxed `code`
parameter, which only works against a build made with `ENABLE_CODE_EXEC=true`
(e.g. `npm run build:debug`). To avoid spurious failures on plain builds, that
suite is skipped unless `ENABLE_CODE_EXEC=true` is also present in the test
environment. Run it explicitly with:

```bash
ENABLE_CODE_EXEC=true npm run e2e:mcp
```

`workflow/ppal-connect.test.ts` needs the same variable for a different reason:
it asserts the served skills equal a locally assembled `buildSkills()`, and the
`code-transforms` fragment ships only under the flag. Without it, a debug build
serves a blob this test process can't reproduce.

## How It Works

Tests automatically:

1. Open a Live Set from `e2e/live-sets/` in Ableton Live
2. Handle the "Don't Save" dialog if it appears (via AppleScript)
3. Wait for the MCP server to become responsive
4. Run the test suite

## Test Live Sets

Three Sets live in `e2e/live-sets/`, each with a `-spec.md` beside it listing
everything in it. Those specs are the reference for writing assertions.

| Set                      | Covers                                                |
| ------------------------ | ----------------------------------------------------- |
| `e2e-test-set`           | everything else; the default                          |
| `racks-test`             | nested racks, macro-mapped params, rack return chains |
| `arrangement-clip-tests` | arrangement clip edits                                |

`e2e-test-set` has 12 tracks (t0-t11) and 2 return tracks: 4 MIDI music tracks,
2 audio, an FX bus, a Racks track, an empty track, a group parent and its child,
and the track holding the Producer Pal device. 8 scenes, 108 BPM, A minor.

`setupMcpTestContext()` opens `e2e-test-set`. Pass `liveSetPath` for another,
using the constant its helpers export:

```ts
const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });
```

## Custom MCP URL

Set the `MCP_URL` environment variable to use a different server:

```bash
MCP_URL=http://192.168.1.100:3350/mcp npm run e2e:mcp
```

## Testing another Live version

`ABLETON_APP` names the app bundle the tests open Sets with, so a Live installed
side-by-side can be tested without changing anything else. It defaults to
`Ableton Live 12 Suite`.

Pass the **full bundle path**. `open -a` resolves the default install by name,
but has been seen to reject a side-by-side one — `"Ableton Live 12 Suite 12.3"`
fails with "Unable to find application named" even though the app is there:

```bash
ABLETON_APP="/Applications/Ableton Live 12 Suite 12.3.app" \
  npm run e2e:mcp -- track/ppal-take-lanes
```

A Set opens only in the Live that saved it or a newer one. Point an older Live
at a Set a newer one saved and Live puts up a modal instead of opening it — the
harness dismisses that and fails with Live's own message, naming the version the
Set needs. Rebuild the Set in the oldest supported Live to fix it; Live cannot
save a Set back to an older version.

## Directory Structure

Tests are organized by resource type, mirroring `src/tools/`:

```
e2e/mcp/
├── mcp-test-helpers.ts    # Shared test utilities
├── clip/                  # Clip tools (create, read, update, transform)
├── control/               # Playback, select, and the Direct Live API tool
├── device/                # Device tools (create, read, update)
├── live-set/              # Live Set tools (read, update)
├── operations/            # Cross-resource tools (delete, duplicate)
├── scene/                 # Scene tools (create, read, update)
├── track/                 # Track tools (create, read, update)
└── workflow/              # Workflow tools (connect, memory)
```

## Adding New Tests

1. Create a new file in the appropriate subdirectory (e.g.,
   `track/ppal-delete-track.test.ts`)
2. Import helpers from `../mcp-test-helpers`
3. Use `setupMcpTestContext()` for tests that modify state
4. Use `setupMcpTestContext({ once: true })` for read-only tests (faster)
