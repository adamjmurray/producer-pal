# Raw Live API Tool - Technical Design

## Overview

The `ppal-raw-live-api` tool provides direct, low-level access to the Live API
for research, development, and debugging purposes. This tool exposes the full
capabilities of the LiveAPI class, allowing developers to experiment with new
features and troubleshoot issues without the abstractions of our higher-level
tools.

**Important**: This tool is intended for development use only and will not be
included in production builds.

## Build-Time Configuration

The tool is conditionally included in builds using a build-time environment
variable:

```bash
ENABLE_RAW_LIVE_API=true
```

**Important**: This is a build-time flag, not a runtime flag. The tool is either
compiled into the bundle or completely excluded during the build process using
Rollup's `@rollup/plugin-replace` plugin.

## Tool Interface

### Input Schema

```javascript
{
  path?: string,              // Optional LiveAPI path (e.g., "live_set tracks 0")
  operations: [               // Array of operations (max 50)
    {
      type: "get_property" | "set_property" | "call_method" | "get" | "set" | "call" | "goto" | "info" | "getProperty" | "getChildIds" | "exists" | "getColor" | "setColor",
      property?: string,      // For get_property/set_property/get/set/getProperty/getChildIds operations
      method?: string,        // For call_method/call operations
      args?: any[],          // For call_method/call operations
      value?: any            // For set_property/set operations, path for goto, or color for setColor
    }
  ]
}
```

### Output Schema

```javascript
{
  path: string,              // Current LiveAPI path
  id: string,                // Current LiveAPI id
  results: [                 // Results for each operation
    {
      operation: object,     // Copy of the input operation
      result: any            // Operation result (may be null/undefined)
    }
  ]
}
```

### Operation Types

**Core Operations (Explicit)**

- `get_property` - Direct property access:
  `{type: "get_property", property: "id"}`
- `set_property` - Direct property assignment:
  `{type: "set_property", property: "name", value: "My Track"}`
- `call_method` - Method calls:
  `{type: "call_method", method: "get", args: ["tempo"]}`

**Convenience Shortcuts**

- `get` - Calls `get()` method: `{type: "get", property: "tempo"}` (equivalent
  to `liveApi.get("tempo")`)
- `set` - Calls `set()` method:
  `{type: "set", property: "name", value: "My Track"}` (equivalent to
  `liveApi.set("name", "My Track")`)
- `call` - Calls `call()` method:
  `{type: "call", method: "function_name", args: ["arg1", "arg2"]}` (equivalent
  to `liveApi.call("function_name", "arg1", "arg2")`)
- `goto` - Calls `goto()` method: `{type: "goto", value: "live_set tracks 0"}`
  (equivalent to `liveApi.goto("live_set tracks 0")`)
- `info` - Gets `info` property: `{type: "info"}` (equivalent to `liveApi.info`)
- `getProperty` - Calls `getProperty()` extension:
  `{type: "getProperty", property: "name"}` (equivalent to
  `liveApi.getProperty("name")`)
- `getChildIds` - Calls `getChildIds()` extension:
  `{type: "getChildIds", property: "clip_slots"}` (equivalent to
  `liveApi.getChildIds("clip_slots")`)
- `exists` - Calls `exists()` extension: `{type: "exists"}` (equivalent to
  `liveApi.exists()`)
- `getColor` - Calls `getColor()` extension: `{type: "getColor"}` (equivalent to
  `liveApi.getColor()`)
- `setColor` - Calls `setColor()` extension:
  `{type: "setColor", value: "#FF0000"}` (equivalent to
  `liveApi.setColor("#FF0000")`)

## Supported LiveAPI Features

### Built-in Properties (read/write access)

- `children` - Array of child objects
- `id` - Current object ID
- `info` - Object description (read-only)
- `mode` - Follow mode (0 = follow object, 1 = follow path)
- `path` - Current path
- `property` - Observed property name
- `proptype` - Type of observed property (read-only)
- `type` - Object type (read-only)

### Extension Properties (from live-api-extensions.js)

- `trackIndex` - Get track index for track objects (0-based)
- `sceneIndex` - Get scene index for scene objects (0-based)
- `clipSlotIndex` - Get clip slot index for clip objects (0-based, same as
  sceneIndex)

### Built-in Methods

- `get(property)` - Get property value
- `getstring(property)` - Get property as string
- `getcount(child)` - Count child objects
- `call(function, ...args)` - Call object function
- `set(property, value)` - Set property value
- `goto(path)` - Navigate to path

### Extension Methods (from live-api-extensions.js)

- `exists()` - Check if object is valid
- `getProperty(name)` - Enhanced property getter
- `getChildIds()` - Get array of child IDs
- `getChildren()` - Get array of child objects
- `getColor()` - Get color as hex string
- `setColor(color)` - Set color from hex string

### Excluded Features

- Constructor callbacks (not to be supported at this time)
- `patcher` property (not relevant for our use case)
- `unquotedpath` property (deferred - note: should be identical to `path` in
  current LiveAPI)

## Extensions Integration

The tool automatically applies our Live API extensions to the LiveAPI instance,
making all extension methods available via `call` operations. No additional
configuration is required.

## Implementation Approach

1. **Build-Time Conditional Compilation**: Uses Rollup's
   `@rollup/plugin-replace` to replace `process.env.ENABLE_RAW_LIVE_API` with
   literal values at build time
2. **Tree Shaking**: When the environment variable is not "true", the entire
   tool and its dependencies are eliminated from the bundle via dead code
   elimination
3. **LiveAPI Creation**: Instantiate `LiveAPI(path)` with optional path
   parameter
4. **Extensions Application**: Automatically apply Live API extensions using
   `applyLiveApiExtensions()`
5. **Operation Processing**: Execute operations sequentially, capturing results
6. **Result Aggregation**: Return structured response with all operation results

## NPM Scripts Integration

The build-time environment variable is integrated into the development workflow:

### Scripts

- `npm run build` - Production build (excludes raw API tool completely)
- `npm run build:all` - Development build (includes raw API tool)
- `npm run dev` - Development mode with auto-rebuild (includes raw API tool)

### Implementation

The package.json scripts set the environment variable at build time:

```json
{
  "scripts": {
    "build": "npm run parser:build && rollup -c",
    "build:all": "ENABLE_RAW_LIVE_API=true npm run parser:build && ENABLE_RAW_LIVE_API=true rollup -c",
    "dev": "ENABLE_RAW_LIVE_API=true rollup -c -w"
  }
}
```

### Rollup Configuration

The `@rollup/plugin-replace` plugin handles the build-time replacement:

```javascript
replace({
  "process.env.ENABLE_RAW_LIVE_API": JSON.stringify(
    process.env.ENABLE_RAW_LIVE_API,
  ),
  preventAssignment: true,
});
```

This replaces all instances of `process.env.ENABLE_RAW_LIVE_API` in the source
code with the actual string value ("true" or undefined), enabling dead code
elimination when the tool is disabled.

## Example Usage

### Basic Property and Method Access

```javascript
{
  "path": "live_set tracks 0",
  "operations": [
    { "type": "get_property", "property": "id" },
    { "type": "get_property", "property": "children" },
    { "type": "get", "property": "name" }
  ]
}
```

### Using Core Operations vs Convenience Shortcuts

```javascript
{
  "path": "live_set",
  "operations": [
    { "type": "info" },                                                    // Convenience: gets info property
    { "type": "get_property", "property": "info" },                       // Equivalent core operation
    { "type": "get", "property": "tempo" },                               // Convenience: calls get("tempo")
    { "type": "call_method", "method": "get", "args": ["tempo"] }          // Equivalent core operation
  ]
}
```

### Using Extensions

```javascript
{
  "path": "live_set tracks 0",
  "operations": [
    { "type": "info" },
    { "type": "getProperty", "property": "name" },
    { "type": "exists" },
    { "type": "getChildIds", "property": "clip_slots" },
    { "type": "getColor" }
  ]
}
```

### Navigation and Property Setting

```javascript
{
  "operations": [
    { "type": "goto", "value": "live_set tracks 0" },
    { "type": "set", "property": "name", "value": "My Track" },
    { "type": "get", "property": "name" }
  ]
}
```

## Security Considerations

- **Development Only**: Tool is only available when explicitly enabled via
  environment variable
- **Full Access**: This tool provides unrestricted Live API access - use with
  caution
- **No Validation**: Operations are passed directly to LiveAPI - malformed calls
  may cause errors
- **State Changes**: Tool can modify Live session state - always test in safe
  environments

## Error Handling

- Any operation failure causes the entire tool call to fail with standard MCP
  error handling
- LiveAPI errors are propagated as tool errors with descriptive messages
- Invalid operation types throw errors immediately
- Operations are processed sequentially until an error occurs

## Warning Handling and Debugging

- Live API warnings (e.g., "Invalid syntax") may appear during operations
- **Important limitation**: When running multiple operations in a single tool
  call, warnings appear at the end without indicating which specific operation
  triggered them
- **Debugging recommendation**: If you encounter warnings, run operations
  individually to isolate which operation causes the warning
- This limitation is inherent to the Live API's warning system and cannot be
  easily resolved

## Performance Notes

- Operations are executed sequentially to maintain consistency
- Maximum 50 operations per tool call to prevent performance issues
- Consider breaking complex workflows into multiple tool calls if needed

## Implementation Notes

1. **Path Handling**: Empty/null path creates LiveAPI without arguments (follows
   constructor behavior)
2. **Extensions Application**: Extensions are automatically applied to the
   LiveAPI instance using `applyLiveApiExtensions()`
3. **Parameter Destructuring**: Tool function uses standard parameter
   destructuring: `rawLiveApi({ path, operations } = {})`
4. **JSDoc Documentation**: Comprehensive JSDoc comments document all parameters
   and return values
5. **Result Consistency**: All operations return results in the same format for
   predictable parsing
6. **Error Propagation**: Any operation failure stops execution and propagates
   as a tool error
7. **Build-Time Exclusion**: In production builds, the tool code is completely
   removed via dead code elimination, resulting in zero bundle size impact

## Future Enhancements

- **Batch Operations**: Optimize for common operation patterns
- **Live State Monitoring**: Add ability to observe property changes
- **Export/Import**: Tools to save/restore LiveAPI exploration sessions
- **Interactive Mode**: REPL-style interface for real-time exploration

---

**Note on unquotedpath**: The LiveAPI documentation mentions both `path` and
`unquotedpath` properties. In current LiveAPI implementations, these appear to
be identical (no explicit quotes in path values). We're deferring support for
`unquotedpath` until we encounter a use case where it differs from `path`.
