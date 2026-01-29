# MCP Protocol E2E Tests

End-to-end tests that verify Producer Pal tools via the MCP protocol.

## Prerequisites

1. **Build the project**: `npm run build:all`
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

## How It Works

Tests automatically:

1. Open the `basic-midi-4-track` Live Set in Ableton Live
2. Handle the "Don't Save" dialog if it appears (via AppleScript)
3. Wait for the MCP server to become responsive
4. Run the test suite

## Custom MCP URL

Set the `MCP_URL` environment variable to use a different server:

```bash
MCP_URL=http://192.168.1.100:3350/mcp npm run e2e:mcp
```

## Adding New Tests

1. Create a new file following the pattern: `<tool-name>.test.ts`
2. Use `openLiveSet()` from `#evals/eval/open-live-set.ts` in `beforeAll`
3. Use `connectMcp()` from `#evals/chat/shared/mcp.ts` to get an MCP client
