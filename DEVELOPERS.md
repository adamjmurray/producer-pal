# Producer Pal Development Info

⚠️ This project does _not_ accept pull requests or contributions! ⚠️

Here's the deal: I built this project for myself. The project roadmap and future
features are things I want, and that's what I'm going to spend my limited time
building.

I open-sourced this because I want people to realize there's no "magic" here,
and they can make tools like this for themselves too. If you really want to take
this project in a different direction, you can fork this project and change it
however you want.

Don't send pull requests for bugs either. I'd much rather get a clear bug report
and then decide how I want to fix it (if I want to fix it).

## Building from source

Requires [Node.js](https://nodejs.org) (recommended v22 or higher)

1. Clone this repository
2. `npm install`
3. `npm run build`
4. Add the `device/Producer Pal.amxd` Max for Live device to a MIDI track in
   Ableton Live
5. Drag and drop `desktop-extension/Producer Pal.dxt` to Claude Desktop →
   Settings → Extension

## Core Development Scripts

Watch for changes and auto-build:

```
npm run dev
```

Automated tests must always pass:

```
npm test
```

To test/debug, you can use:

```
npx @modelcontextprotocol/inspector
```

and then open
http://localhost:6274/?transport=streamable-http&serverUrl=http://localhost:3350/mcp

## Coding Agents

Claude Code assists with the development of this project. A `CLAUDE.md` is
setup, and the `docs` folder contains content that may be worth referencing for
some development tasks.

Additionally, there is a feature `npm run claude:project` which flattens out the
contents of this project into a folder that can be drag and dropped in its
entirety into a Claude Project (or ChatGPT or Gemini projects or whatever you
prefer) for complex brainstorming and planning sessions. Then, those results can
then be fed back into Claude Code (for example by generating a new file for the
`docs` folder).

## Releasing

The version should be bumped for new releases. TODO: Document the
version-bumping process.

Releases consist of two files:

1. `npm build` will produce the `desktop-extension/Producer Pal.dxt` file. Grab
   this file, and save it to "release storage" with a version number suffix in
   the filename.

2. After `npm build` generates the latest code for the Max for Live device, edit
   the device in Max, click the "freeze" button (to pack up all dependencies
   like the JS code), "save as...", and save it to "release storage" with a
   version number suffix in the filename.

## End-to-End Testing

For real-world testing and debugging, use the CLI tool at `tools/cli.mjs` to
directly connect to the MCP server running in Ableton Live:

```sh
# Show server info (default)
node tools/cli.mjs

# List available tools
node tools/cli.mjs tools/list

# Call a tool with JSON arguments
node tools/cli.mjs tools/call read-song '{}'
node tools/cli.mjs tools/call duplicate '{"type": "scene", "id": "7", "destination": "arrangement", "arrangementStartTime": "5|1"}'

# Use a different server URL
node tools/cli.mjs http://localhost:6274/mcp tools/list

# Show help
node tools/cli.mjs --help
```

This CLI tool connects directly to your running Ableton Live session and can
help debug real-world issues by exercising the full MCP stack with actual Live
data.

## Development Tools

### Raw Live API Access

For development and debugging, a `raw-live-api` tool is available when building
with `npm run dev` or `npm run build:all`. This tool provides direct access to
the Live API for research and advanced debugging:

```sh
# Example: Get tempo using multiple operation types
node tools/cli.mjs tools/call raw-live-api '{
  "path": "live_set",
  "operations": [
    {"type": "get", "property": "tempo"},
    {"type": "getProperty", "property": "tempo"}
  ]
}'

# Example: Navigate to a track and check if it exists
node tools/cli.mjs tools/call raw-live-api '{
  "operations": [
    {"type": "goto", "value": "live_set tracks 0"},
    {"type": "exists"},
    {"type": "getProperty", "property": "name"}
  ]
}'
```

The `raw-live-api` tool supports 13 operation types including core operations
(`get_property`, `set_property`, `call_method`), convenience shortcuts (`get`,
`set`, `call`, `goto`, `info`), and extension methods (`getProperty`,
`getChildIds`, `exists`, `getColor`, `setColor`).
