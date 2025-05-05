# Ableton Live Composition Assistant Architecture and Technical Specifications

## Architecture Overview

The main parts of the system are:

- Claude Desktop connects to `mcp-remote`, a proxy that adapts the stdio transport to the streamable HTTP transport
- `mcp-remote` connects to an MCP server in a Node.js process using the streamable HTTP transport
- the Node.js process is running in a Node for Max object in a Max for Live device in Ableton Live
- the Node.js process doesn't have direct access to the Live API, so it sends serialized JSON strings to a Max v8 object
  (a V8-based JavaScript engine) in the same Max for Live device (via a Max message sent over a virtual patch cable)
- the Max v8 object calls the Live API to read and write to the state of, and execute commands in Ableton Live

### Architecture Diagram

```
     +-----------------+
     | Anthropic Cloud |
     +-----------------+
             ↑
             | Anthropic API
             ↓
     +---------------+
     | Claude Desktop |
     +---------------+
             ↑
             | MCP stdio transport
             ↓
     +---------------+
     |   mcp-remote  |
     +---------------+
             ↑
             | MCP streamable HTTP transport
             ↓
+-----------------------------+
|        Ableton Live         |
|  +-----------------------+  |
|  |  Max for Live Device  |  |
|  |  +---------------+    |  |
|  |  | Node for Max  |    |  |
|  |  | (MCP Server)  |    |  |
|  |  +---------------+    |  |
|  |         ↑             |  |
|  |         | Max message |  |
|  |         ↓             |  |
|  |  +---------------+    |  |
|  |  |      v8       |    |  |
|  |  |  (Live API)   |    |  |
|  |  +---------------+    |  |
|  +-----------------------+  |
+-----------------------------+
```

## Implementation Details

- the Node for Max MCP server is bootstrapped by `device/mcp-server.mjs`, which `import`s files in
  `device/mcp-server/**.ts`
- the v8 Max object bootstraps with `main.js`, which `require()`s other JavaScript files in the same folder

## Message Format Specification

### Max Message Request Format (Node for Max → v8)

Messages sent from Node for Max to the v8 object:

```js
// Format: a two-item message: "mcp_request" followed by serialized JSON string
[
  "mcp_request",
  JSON.stringify({
    requestId: number, // Unique identifier for matching responses
    tool: string, // Name of the tool being called
    args: object, // Tool arguments (varies by tool, passed through from MCP request)
  }),
][
  // Example:
  ("mcp_request",
  JSON.stringify({
    requestId: 42,
    tool: "create-clip",
    args: {
      track: 0,
      clipSlot: 1,
    },
  }))
];
```

### Max Message Response Format (v8 → Node for Max)

Messages sent from v8 back to Node for Max:

```js
// Format: a two-item message: "mcp_response" followed by serialized JSON string
["mcp_response", JSON.stringify({
  requestId: number, // Same ID from the original request
  result: {
    content: [ // Array of content items (MCP standard format)
      {
        type: "text", // Content type
        text: string  // Response text
      }
    ],
    isError?: boolean // Optional, set to true for error responses
  }
})]

// Example success response:
["mcp_response", JSON.stringify({
  requestId: 42,
  result: {
    content: [
      {
        type: "text",
        text: "Created empty clip at track 0, clip slot 1"
      }
    ]
  }
})]

// Example error response:
["mcp_response", JSON.stringify({
  requestId: 42,
  result: {
    content: [
      {
        type: "text",
        text: "Error: Clip slot already has a clip"
      }
    ],
    isError: true
  }
})]
```

## ToneLang: custom Music Notation Syntax

See the dedicated ToneLang Specification. Implemented with a parser generator library `peggy`.

## MCP tool interfaces

TODO document with examples, like above
