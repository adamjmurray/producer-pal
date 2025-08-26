# Coding Standards

## File Organization

### Path Comments

All source files must include their relative path as the first line comment:

```javascript
// src/main.js
```

For executable files with shebang:

```javascript
#!/usr/bin/env node
// scripts/cli.mjs
```

This ensures clarity when files are copied to Claude Project with flattened
names.

### Import Requirements

All imports must include explicit file extensions:

```javascript
// ✅ Correct
import { createMcpServer } from "../src/mcp-server/create-mcp-server.js";
import * as console from "./console.js";

// ❌ Wrong
import { createMcpServer } from "../src/mcp-server/create-mcp-server";
```

Required by Node.js ES module resolution when running scripts directly.

## Code Style

### Null Checks

Prefer loose equality for null checks:

```javascript
// ✅ Preferred
if (value == null) {
} // Checks both null and undefined
x ?? y; // Nullish coalescing

// ⚠️ Use only when specifically needed
if (value === null) {
} // Only when distinguishing from undefined
if (value === undefined) {
} // Only for optional explicit nulls
```

### Object Syntax

Use ES6 shorthand when possible:

```javascript
// ✅ Preferred
{ name, color }

// ❌ Avoid when unnecessary
{ name: name, color: color }
```

### Comments

Keep code comments to a minimum. Prefer:

- Clear variable and function names
- Self-documenting code structure
- Documentation in tool descriptions

## Tool Patterns

### Always Pass Args

All tool entries in `src/main.js` must use this pattern:

```javascript
// ✅ Correct - always pass args
tools: {
  "ppal-create-clip": (args) => createClip(args),
  "ppal-init": (args) => init(args),  // Even if currently unused
}

// ❌ Wrong - missing args will cause bugs
tools: {
  "ppal-init": () => init(),
}
```

This prevents bugs when parameters are added later.

### Zod Schema Limitations

Due to MCP SDK limitations, avoid:

- `z.union()`
- `z.array()`
- Complex nested structures

Stick to:

- Primitive types (string, number, boolean)
- Enums of primitives
- For bulk operations, use comma-separated strings

```javascript
// ✅ Good
ids: z.string().describe("Comma-separated list of IDs"),

// ❌ Problematic
ids: z.array(z.string()),
```

## Live API Patterns

### Use Extensions Interface

Always use `src/live-api-extensions.js` instead of raw API:

```javascript
// ✅ Preferred
import { getProperty } from "./live-api-extensions.js";
const tempo = getProperty(liveset, "tempo");

// ❌ Avoid
const tempo = liveset.get("tempo")?.[0];
```

### Optimistic Updates

For playback operations, return optimistic results:

```javascript
// ✅ Correct - assume success
clip.isTriggered = true; // Assume clip will start
return clip;

// ❌ Wrong - state may not reflect immediately
triggerClip();
return readClipState(); // May show old state
```

## Testing Standards

### Mock Implementations

Always return default `_id` and `_path` in mocks:

```javascript
// ✅ Correct - use function() for 'this' context
liveApiId.mockImplementation(function () {
  // Custom behavior here
  return this._id; // Always return default
});

// ❌ Wrong - arrow function loses 'this'
liveApiId.mockImplementation(() => this._id);
```

### Assertions

Use object matchers for Live API calls:

```javascript
// ✅ Preferred
expect(liveApiCall).toHaveBeenCalledWithThis(
  expect.objectContaining({
    id: "track123", // Use 'id' not '_id'
  }),
  "set",
  "mute",
  1,
);

// ❌ Avoid simple assertions
expect(liveApiCall).toHaveBeenCalledWith("set", "mute", 1);
```

### Test Structure

Write assertions that match expected structure:

```javascript
// ✅ Good - mirrors actual data structure
expect(result).toEqual(
  expect.objectContaining({
    tracks: expect.arrayContaining([
      expect.objectContaining({
        name: "Track 1",
        clips: expect.any(Array),
      }),
    ]),
  }),
);

// ❌ Poor - individual property assertions
expect(result.tracks).toBeDefined();
expect(result.tracks[0].name).toBe("Track 1");
```

## Logging

### Node for Max

```javascript
Max.post("Message to Max console");
```

### V8 Code

```javascript
import * as console from "./console.js";
console.log("Debug message");
console.error("Error message");
```

## Build Requirements

### Development Builds

Always use `npm run build:all` for testing:

- Includes debugging tools
- Enables `ppal-raw-live-api`
- Better error messages

### Production Builds

`npm run build` for releases:

- Excludes debugging tools
- Optimized for end users

## Error Handling

### Graceful Degradation

Always handle missing features gracefully:

```javascript
if (!feature) {
  return formatErrorResponse("Feature not available");
}
```

### User-Friendly Messages

Provide helpful context in errors:

```javascript
// ✅ Good
"Cannot create clip: no instrument found on track";

// ❌ Poor
"Invalid operation";
```

## Design Patterns

### Tool Instructions Over Code Complexity

When providing contextual help or adaptive behavior, prefer tool description
instructions over adding code complexity. Let Claude's intelligence handle
context-aware responses.

**Hybrid approach:** Some tools (like `ppal-init`) return dynamic guidance in
their response data. This combines static tool instructions with
context-specific messages, giving Claude both general patterns and specific
situational guidance.

**Good candidates for tool instructions:**

- Noticing patterns in data (e.g., missing instruments on MIDI tracks)
- Providing contextual warnings or tips
- Adapting messages based on Live Set state
- Educational guidance about best practices

**When to use dynamic response data:**

- Welcome messages or initialization guidance
- Context that changes based on device state
- Warnings specific to the current operation

**When to use code instead:**

- Data transformation or calculations
- Information needed by other tools
- State changes in Live
- Anything requiring deterministic behavior

**Examples:**

- Welcome message in `ppal-init` uses both: tool instructions for general
  behavior, dynamic response for specific messages
- Missing instrument detection uses instructions, not data flags

**Benefits:**

- No new data structures or conditional logic
- Claude adapts messages to conversation context
- Fewer code paths to test
- Future: users can customize these instructions
