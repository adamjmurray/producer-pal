# Desktop Extension

The Producer Pal Desktop Extension (MCP Bundle) bridges Claude Desktop's stdio
transport to the HTTP MCP server in Ableton Live.

## Build

```bash
npm run dxt:build
```

Generates `claude-desktop-extension/manifest.json` from template, extracts tool
definitions, and bundles into `Producer_Pal.mcpb`.

**Distribution**: Both `.mcpb` file AND frozen Max device required.

## Bridge Behavior

**File**: `src/claude-desktop-extension/main.js` (bundled as
producer-pal-portal.js)

- **Online**: Forwards MCP requests to HTTP server
- **Offline**: Returns static tool definitions + setup instructions
  (https://github.com/adamjmurray/producer-pal)

### Implementation Requirements

**Tool names**: Must match `^[a-zA-Z0-9_-]{1,64}$` (use `ppal-create-clip`, not
"Create Clip")

**Schemas**: Fallback schemas must be JSON Schema (use `zodToJsonSchema()`)

**Dependencies**: Zero runtime dependencies (all bundled, OAuth stubbed)

## Testing

### Manual (Claude Desktop)

After changing tool descriptions:

1. Toggle Producer Pal extension OFF
2. Toggle back ON (rebuild/restart NOT sufficient)

### Automated

```bash
# Basic test
node scripts/test/test-claude-desktop-extension.ts

# Specific tool
node scripts/test/test-claude-desktop-extension.ts ppal-read-live-set

# With arguments
node scripts/test/test-claude-desktop-extension.ts ppal-read-track '{"trackIndex": 0}'

# Custom URL
node scripts/test/test-claude-desktop-extension.ts http://localhost:3350/mcp ppal-read-live-set
```

## Logging

Enable with `ENABLE_LOGGING=true` and `VERBOSE_LOGGING=true`

**Locations**:

- macOS: `~/Library/Logs/Producer Pal/`
- Windows: `%LOCALAPPDATA%\ProducerPal\Logs\`
- Linux: `~/.local/share/Producer Pal/logs/`
