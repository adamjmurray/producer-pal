# MCP Protocol E2E Tests

End-to-end tests that verify Producer Pal tools via the MCP protocol.

## Prerequisites

These tests require a fully running Producer Pal setup:

1. **Build the project**: `npm run build:all`
2. **Ableton Live running** with the Producer Pal device active
3. **MCP server accessible** at `http://localhost:3350/mcp` (default)

## Running Tests

```bash
# Run MCP e2e tests
npm run e2e:mcp

# Run in watch mode
npm run e2e:mcp:watch
```

## Custom MCP URL

Set the `MCP_URL` environment variable to use a different server:

```bash
MCP_URL=http://192.168.1.100:3350/mcp npm run e2e:mcp
```

## Test Behavior

- Tests automatically **skip** when the MCP server is unavailable
- No error is thrown - tests are marked as skipped with a warning message
- This allows the test suite to run in CI without failing

## Adding New Tests

1. Create a new file following the pattern: `<tool-name>.test.ts`
2. Use `connectMcp()` from `#evals/chat/shared/mcp.ts`
3. Use `describe.skipIf(shouldSkip())` for graceful degradation
