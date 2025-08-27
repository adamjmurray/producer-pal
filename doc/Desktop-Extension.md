# Desktop Extension

## Overview

The Producer Pal Desktop Extension (DXT) provides the bridge between Claude
Desktop's stdio transport and the HTTP MCP server running in Ableton Live.

## Build Process

### Manifest Generation

The Desktop Extension manifest is generated from
`scripts/desktop-extension-manifest.template.json` during build:

```bash
npm run dxt:build
```

This process:

1. Extracts tool definitions from the MCP server
2. Filters out development-only tools (like `ppal-raw-live-api`)
3. Generates user-friendly tool descriptions
4. Creates `desktop-extension/manifest.json`
5. Bundles everything into `Producer_Pal.dxt`

### Distribution Requirements

When building releases:

- **Both** the `.dxt` file AND the frozen Max for Live device are needed
- The `.dxt` includes the stdio-HTTP bridge bundled with all dependencies
- User configuration (like port) is handled by Claude Desktop UI

## Extension Bridge Implementation

### File: `src/desktop-extension/main.js` (claude-ableton-connector.js in bundle)

The bridge provides robust fallback behavior:

#### Online Mode

When Producer Pal is running in Ableton Live:

- Forwards all MCP requests to HTTP server
- Full tool functionality available
- Real-time Live Set manipulation

#### Offline Mode

When Producer Pal is not accessible:

- Returns static tool definitions from `create-mcp-server`
- Tool listing always works via fallback definitions
- Tool calls return setup instructions pointing to
  https://github.com/adamjmurray/producer-pal

### Critical Implementation Details

**Tool Name Requirements:**

- Must match regex `^[a-zA-Z0-9_-]{1,64}$`
- Use original `name`, not display name
- Example: `ppal-create-clip` not "Create Clip"

**Schema Conversion:**

- Fallback schemas must be JSON Schema, not Zod objects
- Use `zodToJsonSchema()` for conversion
- Required for Claude Desktop compatibility

**Zero Dependencies:**

- All dependencies bundled during build
- OAuth imports replaced with stub functions
- No runtime npm dependencies needed

## Testing

### Manual Testing in Claude Desktop

After changing tool descriptions:

1. Toggle Producer Pal extension OFF in Claude Desktop settings
2. Toggle extension back ON
3. Tool descriptions will refresh

Simply rebuilding or restarting Claude Desktop is NOT sufficient - the extension
must be disabled and re-enabled.

### Automated Testing

Test the stdio-HTTP bridge without Claude Desktop:

```bash
# Basic test
node scripts/test-desktop-extension.mjs

# Test specific tool
node scripts/test-desktop-extension.mjs ppal-read-song

# Test with arguments
node scripts/test-desktop-extension.mjs ppal-read-track '{"trackIndex": 0}'

# Custom URL
node scripts/test-desktop-extension.mjs http://localhost:3350/mcp ppal-read-song
```

The test script:

1. Starts the stdio-HTTP bridge process
2. Sends MCP protocol messages (initialize, tools/list, tools/call)
3. Parses and validates responses
4. Provides timing information

## Error Handling

### Connection Errors

When Live isn't running or Producer Pal device isn't loaded:

```
❌ Cannot connect to Producer Pal in Ableton Live.
[Setup instructions and requirements]
```

### Invalid URL Configuration

When the configured URL is malformed:

```
❌ Invalid URL for the Producer Pal Desktop Extension.
[Configuration instructions]
```

## Logging

When debugging is needed:

**Enable logging:**

```bash
ENABLE_LOGGING=true
VERBOSE_LOGGING=true
```

**Log locations:**

- macOS: `~/Library/Logs/Producer Pal/`
- Windows: `%LOCALAPPDATA%\ProducerPal\Logs\`
- Linux: `~/.local/share/Producer Pal/logs/`

## Design Principles

### Adaptive Messaging

The extension prefers adding instructions to tool descriptions over adding code
complexity. Claude's intelligence handles context-aware responses rather than
encoding rules in JavaScript.

Examples:

- Welcome message in `ppal-init` tool description
- Missing instrument detection in tool responses
- Setup instructions in offline mode

This pattern keeps the bridge simple while providing rich user guidance.
