# Development Tools

Essential tools for testing, debugging, and validating Producer Pal
functionality. Claude Code should use these tools to ensure quality and
investigate issues.

This page covers the everyday CLIs, builds, test workflows, and debugging. The
rest is split out by area:

- [mcp-test-clients.md](mcp-test-clients.md) — the `ppal-client` CLI, the debug
  `ppal-live-api` tool and its operation types, and the MCP Inspector.
- [live-api-measurement.md](live-api-measurement.md) — dumping a Live Set,
  counting LiveAPI objects, the object staleness probe, and timing tool calls.

## Chat & Eval CLIs

`scripts/chat` (interactive chat against the MCP tools) and `scripts/eval` (run
eval scenarios) select a model with `-m provider/model`. Discover models with
`--list-models <provider>` (lists a provider's models live) or `--list-models`
with no value (lists the providers); listing always prints and exits without
starting a chat or run.

```bash
scripts/chat --list-models            # list providers
scripts/chat --list-models openai     # list one provider's models
scripts/chat -m claude-sonnet-5       # start a chat
```

## Skills Snapshots

`npm run skills:snapshot` writes the assembled skills blob for every (toolset
profile × depth × notation) to `tmp/skills-snapshots/` (gitignored) and prints a
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
