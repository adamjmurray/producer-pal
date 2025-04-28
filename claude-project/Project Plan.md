# MVP Project Plan

## Phase 1: Basic MCP Server (outside Max/Live)

- ✅ Build a simple MCP server with Node.js 23 native TypeScript support and call a custom tool from Claude Desktop. Use the stdio transport to keep things simple for this first version.
- ✅ Use the official [MCP inspector](https://modelcontextprotocol.io/docs/tools/inspector#inspector) to test our simple MCP server (confirm we know how to use this inspector tool). This requires converting the stdio transport to an HTTP transport. We'll use the new, preferred StreamableHTTP transport.
- Setup mcp-proxy integration and get the StreamableHTTP transport MCP server to work with Claude Desktop

## Phase 2: Ableton Live Integration

- Create the Max for Live device shell, bootstrap Node for Max with an entry script that loads our simple MCP from phase 1, and call the custom MCP tool running inside Ableton Live from Claude Desktop
- Hook up the Max for Live device's MCP server to the Live API and rework the custom tool from phase 2 to create a MIDI clip in session view. Create a clip from Claude Desktop
- Build out MIDI clip generation capability to generates notes
- Add another tool for transforming notes in existing MIDI clips
- Expand on the clip generation capabilities (TBD once we have a working prototype)
- Expand on the clip transformation capabilities (TBD once we have a working prototype)

## Phrase 3: TBD, pending more brainstorming after progress on the above
