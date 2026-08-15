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

1. Open the `basic-midi-4-track` Live Set in Ableton Live
2. Handle the "Don't Save" dialog if it appears (via AppleScript)
3. Wait for the MCP server to become responsive
4. Run the test suite

## Test Live Set

The `basic-midi-4-track` Live Set contains:

- 4 MIDI tracks (the "music" tracks)
- 1 track with the Producer Pal Max for Live device
- Total: 5 tracks reported by the API

## Custom MCP URL

Set the `MCP_URL` environment variable to use a different server:

```bash
MCP_URL=http://192.168.1.100:3350/mcp npm run e2e:mcp
```

## Directory Structure

Tests are organized by resource type, mirroring `src/tools/`:

```
e2e/mcp/
├── mcp-test-helpers.ts    # Shared test utilities
├── clip/                  # Clip tools (create, read, update, transform)
├── device/                # Device tools (create, read, update)
├── live-set/              # Live Set tools (read, update)
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
