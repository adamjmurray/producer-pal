# Desktop Extension

The Producer Pal Desktop Extension (MCP Bundle) bridges Claude Desktop's stdio
transport to the HTTP MCP server in Ableton Live.

## Build

```bash
npm run dxt:build
```

Generates `claude-desktop-extension/manifest.json` from template, extracts tool
definitions, and bundles into `Producer_Pal.mcpb`.

**Distribution**: Both `.mcpb` file AND frozen Max device required. The mcpb
also carries a copy of the frozen device beside the portal script, so the portal
can install it without a download. That copy exists only in a release package
(`npm run release:package`, run after the Max freeze). `dxt:build` alone, and
every plain `npm run build`, produces an mcpb with no device, and the portal
treats that as "none bundled". The Max device bundle never contains the `.amxd`.
See [releasing](../process/releasing.md) and
[what the portal carries](../architecture/runtime-boundary.md#what-the-portal-carries).

## Bridge Behavior

**File**: `src/portal/producer-pal-portal.ts` (bundled as
producer-pal-portal.js)

- **Online**: Forwards MCP requests to HTTP server
- **Offline**: Returns static tool definitions + setup instructions
  (https://github.com/adamjmurray/producer-pal)

### Implementation Requirements

**Tool names**: Must match `^[a-zA-Z0-9_-]{1,64}$` (use `ppal-create-clip`, not
"Create Clip")

**Schemas**: Fallback schemas must be JSON Schema (built with `z.toJSONSchema()`
in `src/portal/fallback-tools.ts`)

**Dependencies**: Zero runtime dependencies (all bundled, OAuth stubbed)

## Settings are per-client

Every portal setting (env vars from the extension's `user_config`, or CLI flags)
rides as a per-request header (`src/portal/portal-settings.ts`, resolved in
`src/mcp-server/helpers/http/request-profile.ts`). A setting reaches only the
client that sent it, and the device's own settings are the fallback for whatever
a request doesn't specify. The device's Setup tab therefore doesn't change what
Claude Desktop sees for small-model mode, Direct Live API or JSON output; those
live in the extension's settings. Env vars apply directly, with no opt-in gate,
because there is no shared state to clobber.

The portal also sends its own version on every request, so `ppal-connect` can
flag a portal/device version mismatch
([details](../architecture/runtime-boundary.md#portal-version)).

mcpb can't express "unset": an untoggled checkbox arrives as `false`. So the
three booleans are always sent, and `false` is the right default for Claude
Desktop anyway (each is documented as not recommended for the models it runs).
The string settings (`NOTATION`, `TOOLS`, `DISABLE_TOOLS`) treat `""` as "follow
the device." Don't turn the booleans into tri-state text fields to avoid the
forcing; a checkbox is the right control.

## Testing

### Manual (Claude Desktop)

After changing tool descriptions:

1. Toggle Producer Pal extension OFF
2. Toggle back ON (rebuild/restart NOT sufficient)

### Automated

```bash
# Basic test
node scripts/build-and-release/test-claude-desktop-extension.ts

# Specific tool
node scripts/build-and-release/test-claude-desktop-extension.ts ppal-read-live-set

# With arguments
node scripts/build-and-release/test-claude-desktop-extension.ts ppal-read-track '{"path": "t0"}'

# Custom URL
node scripts/build-and-release/test-claude-desktop-extension.ts http://localhost:3350/mcp ppal-read-live-set
```

## Logging

Enable with `ENABLE_LOGGING=true` and `VERBOSE_LOGGING=true`

**Locations**:

- macOS: `~/Library/Logs/Producer Pal/`
- Windows: `%LOCALAPPDATA%\ProducerPal\Logs\`
- Linux: `~/.local/share/Producer Pal/logs/`
