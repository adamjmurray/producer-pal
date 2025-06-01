# Ableton Producer Pal

Make music in Ableton Live with an AI assistant such as [Anthropic Claude](https://www.anthropic.com/claude).

## Goals and Use Cases

- Supplement, complement, and enhance human creativity. Don't replace human creativity!

- Get unblocked when creatively blocked. Get started when you don't know where to start.

- Experiment with music in terms of high level ideas instead of the low level piano roll events. Try things you never
  tried before.

- Hands-on learning for music theory, composition, and arrangement. Go as deep (or shallow) as you want.

- Help people with disabilities produce music (assuming Claude Desktop or an alternative chat client can be used in a
  hands-free voice mode, this should be possible)

## Dependencies

- [Ableton Live 12.2+](https://www.ableton.com/live/) with [Max for Live](https://www.ableton.com/live/max-for-live/)
  (e.g. Ableton Live Suite edition)
- [Claude Desktop](https://claude.ai/download) (or potentially any [MCP-compatible](https://modelcontextprotocol.io/) AI
  chat client, but only Claude Desktop has been tested so far)
- [Node.js](https://nodejs.org/). Install the default version (LTS version, or newer works too). You should add Node.js
  to your PATH if given the option.

## Setup

1. Install this Max for Live device. Currently, this involves:
   - clone this repository
   - `npm install`
   - `npm run build`
   - Add the `device/Producer Pal.amxd` Max for Live device to your Ableton Live Set (drag the file to a MIDI track)
2. Configure Claude Desktop to connect to the Producer Pal

   - Go to Claude Desktop → Settings → Developer → Edit Config → Open `claude_desktop_config.json` in a text editor
   - Copy the settings from the Producer Pal Max for Live device into `claude_desktop_config.json`. It should look
     something like this:

   ```
   {
    "mcpServers": {
      "Ableton Producer Pal": {
        "command": "npx",
        "args": [
          "-y",
          "mcp-remote@0.1.9",
          "http://localhost:3350/mcp"
        ]
      }
    }
   }
   ```

3. Restart Claude Desktop

   - In the "Search and Tools" button below the chat input, you should see `Ableton Producer Pal` and if you click into
     it, there should be 12 tools such as `read-song` and `write-song`. Make sure `Ableton Producer Pal` and its tools
     are enabled (they should be enabled by default, unless you disable them).

## Usage Examples

- Start a chat like:

  > Let's play with Ableton Live

- Setup a drum rack in a track called "Drums" and ask:

  > Find the Drums track and generate a 4-bar drum loop

- Setup some pads or keys in a track called "Chords" and ask:

  > In the Chords track, generate a 4-chord progression of whole notes in C minor

- Then:

  > In the Bass track, generate a bassline to go along with that chord progress

- Let the AI tell you what else it can do:

  > What are all the things you can do with your Ableton Live tools?

## Development

Use

```sh
npm run dev
```

to watch and auto-build the code.

To test/debug, you can use:

```sh
npx @modelcontextprotocol/inspector
```

and then open http://localhost:6274/?transport=streamable-http&serverUrl=http://localhost:3350/mcp

### End-to-End Testing

For real-world testing and debugging, use the CLI tool at `e2e/cli.mjs` to directly connect to the MCP server running in
Ableton Live:

```sh
# Show server info (default)
node e2e/cli.mjs

# List available tools
node e2e/cli.mjs tools/list

# Call a tool with JSON arguments
node e2e/cli.mjs tools/call read-song '{}'
node e2e/cli.mjs tools/call duplicate '{"type": "scene", "id": "7", "destination": "arranger", "arrangerStartTime": "5|1"}'

# Use a different server URL
node e2e/cli.mjs http://localhost:6274/mcp tools/list

# Show help
node e2e/cli.mjs --help
```

This CLI tool connects directly to your running Ableton Live session and can help debug real-world issues by exercising
the full MCP stack with actual Live data.
