# MVP Project Plan

## Phase 1: Basic MCP Server (outside Max/Live)

- ✅ Build an "echo" tool in an MCP server using stdio transport (because it's the simplest). Call the tool directly from Claude Desktop.
- ✅ Build a "greet" tool in an MCP server using the Streamable HTTP transport. Call it with Claude Desktop via `mcp-remote` adaptor.
- ✅ Learn how to use the MCP Inspector.

## Phase 2: Ableton Live Integration

- ✅ Create the Max for Live device shell, bootstrap Node for Max with an entry script that loads our simple MCP from phase 1, and call the custom MCP tool running inside Ableton Live from Claude Desktop
- Hook up the Max for Live device's MCP server to the Live API and rework the custom tool from phase 2 to create a MIDI clip in session view. Create a clip from Claude Desktop
- Build out MIDI clip generation capability to generates notes
- Add another tool for transforming notes in existing MIDI clips
- Expand on the clip generation capabilities (TBD once we have a working prototype)
- Expand on the clip transformation capabilities (TBD once we have a working prototype)

## Phrase 3: TBD, pending more brainstorming after progress on the above
