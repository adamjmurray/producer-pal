# Raw Live API Tool - Technical Design

## Overview

The `raw-live-api` tool provides direct, low-level access to the Live API for
research, development, and debugging purposes. This tool exposes the full
capabilities of the LiveAPI class, allowing developers to experiment with new
features and troubleshoot issues without the abstractions of our higher-level
tools.

**Important**: This tool is intended for development use only and will not be
included in production builds.

## Environment Configuration

The tool will be conditionally registered with the MCP server based on an
environment variable:

```bash
ENABLE_RAW_LIVE_API=true
```

When this environment variable is not set or is false, the tool will not be
available.

## Tool Interface

### Input Schema

```javascript
{
  path?: string,              // Optional LiveAPI path (e.g., "live_set tracks 0")
  operations: [               // Array of operations (max 50)
    {
      type: "get" | "call" | "set",
      property?: string,      // For get/set operations
      method?: string,        // For call operations
      args?: any[],          // For call operations
      value?: any            // For set operations
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

- `get` - Get property value: `{type: "get", property: "name"}`
- `call` - Call method: `{type: "call", method: "get", args: ["name"]}`
- `set` - Set property: `{type: "set", property: "name", value: "My Track"}`

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

1. **Conditional Registration**: Check `ENABLE_RAW_LIVE_API` environment
   variable in MCP server setup
2. **LiveAPI Creation**: Instantiate `LiveAPI(path)` with optional path
   parameter
3. **Extensions Application**: Automatically apply Live API extensions
4. **Operation Processing**: Execute operations sequentially, capturing results
5. **Result Aggregation**: Return structured response with all operation results

## NPM Scripts Integration

The environment variable will be integrated into the development workflow:

### Scripts

- `npm run build` - Production build (no raw API tool)
- `npm run build:all` - Development build (includes raw API tool)
- `npm run dev` - Development mode with auto-rebuild (includes raw API tool)

### Implementation

```json
{
  "scripts": {
    "build": "npm run parser:build && rollup -c",
    "build:all": "ENABLE_RAW_LIVE_API=true npm run parser:build && ENABLE_RAW_LIVE_API=true rollup -c",
    "dev": "ENABLE_RAW_LIVE_API=true rollup -c -w"
  }
}
```

## Example Usage

### Basic Property Access

```javascript
{
  "path": "live_set tracks 0",
  "operations": [
    { "type": "get", "property": "id" },
    { "type": "get", "property": "children" },
    { "type": "call", "method": "get", "args": ["name"] }
  ]
}
```

### Using Extensions

```javascript
{
  "path": "live_set tracks 0 devices 0",
  "operations": [
    { "type": "get", "property": "info" },
    { "type": "call", "method": "getProperty", "args": ["name"] },
    { "type": "call", "method": "exists" }
  ]
}
```

### Navigation and Property Setting

```javascript
{
  "operations": [
    { "type": "call", "method": "goto", "args": ["live_set tracks 0"] },
    { "type": "set", "property": "name", "value": "My Track" },
    { "type": "call", "method": "get", "args": ["name"] }
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

## Performance Notes

- Operations are executed sequentially to maintain consistency
- Maximum 50 operations per tool call to prevent performance issues
- Consider breaking complex workflows into multiple tool calls if needed

## Implementation Notes

1. **Path Handling**: Empty/null path creates LiveAPI without arguments (follows
   constructor behavior)
2. **Extensions Application**: Extensions are automatically applied to the
   LiveAPI instance
3. **Result Consistency**: All operations return results in the same format for
   predictable parsing
4. **Error Propagation**: Any operation failure stops execution and propagates
   as a tool error

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
