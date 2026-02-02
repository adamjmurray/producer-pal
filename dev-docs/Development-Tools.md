# Development Tools

Essential tools for testing, debugging, and validating Producer Pal
functionality. Claude Code should use these tools to ensure quality and
investigate issues.

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

## Raw Live API Tool

Available only in development builds (`npm run build:all` or `npm run dev`).

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
node scripts/ppal-client.ts tools/call ppal-raw-live-api '{
  "path": "live_set",
  "operations": [
    {"type": "get", "property": "tempo"},
    {"type": "getProperty", "property": "tempo"}
  ]
}'

# Explore track properties
node scripts/ppal-client.ts tools/call ppal-raw-live-api '{
  "path": "live_set tracks 0",
  "operations": [
    {"type": "info"},
    {"type": "getChildIds"}
  ]
}'

# Navigate and modify
node scripts/ppal-client.ts tools/call ppal-raw-live-api '{
  "operations": [
    {"type": "goto", "value": "live_set tracks 0"},
    {"type": "set", "property": "name", "value": "My Track"},
    {"type": "get", "property": "name"}
  ]
}'
```

### Operation Types

**Core operations:**

- `get_property` - Get property value using Live API convention
- `set_property` - Set property value
- `call_method` - Call a method

**Convenience shortcuts:**

- `get` - Alias for get_property
- `set` - Alias for set_property
- `call` - Alias for call_method
- `goto` - Navigate to a new path
- `info` - Get object information

**Extension methods:**

- `getProperty` - Get property with cleaner interface
- `getChildIds` - Get child object IDs
- `exists` - Check if object exists
- `getColor` - Get color as hex string
- `setColor` - Set color from hex string

### Important Limitations

- **Warning location**: When running multiple operations, Live API warnings
  appear at the end without indicating which operation triggered them
- **Debugging tip**: Run operations individually to isolate which operation
  causes warnings
- **Max operations**: 50 operations per tool call to prevent performance issues
- **Full access**: This tool provides unrestricted Live API access - use with
  caution

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
2. `max-for-live-device/main.js` exists
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
npm run build:all

# Run all tests with coverage
npm run test:coverage
# Console shows summary totals; see coverage/coverage-summary.txt for per-file breakdown
# Or open coverage/index.html for visual report

# Format check
npm run format:check

# Manual testing
node scripts/test/test-claude-desktop-extension.ts
```

## Debugging Tips

### Enable Verbose Logging

For desktop extension debugging:

```bash
ENABLE_LOGGING=true VERBOSE_LOGGING=true node scripts/test/test-claude-desktop-extension.ts
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
