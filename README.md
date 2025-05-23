# Ableton Live Composer Assistant

Compose music in Ableton Live with an AI assistant such as [Anthropic Claude](https://www.anthropic.com/claude).

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
  - In theory this should work with free Anthropic accounts (tested with the basic Pro subscription plan)
- [Node.js](https://nodejs.org/) (the default download / the LTS version is good)

## Setup

1. Install this Max for Live device. Currently, this involves:
   - clone this repository
   - `npm install`
   - `npm run build`
   - Add the `device/Composer Assistant.amxd` Max for Live device to your Ableton Live Set (drag the file to a MIDI
     track)
2. Configure Claude Desktop to connect to the Composer Assistant

   - Go to Claude Desktop Settings → Developer → Edit Config → Open `claude_desktop_config.json` in a text editor
   - Copy the settings from the Composer Assistant Max for Live device into `claude_desktop_config.json`. It should look
     something like this:

   ```
   {
    "mcpServers": {
      "ableton-live": {
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

   - In the "Search and Tools" button below the chat input, you should see `ableton-live` and if you click into it,
     there should be 12 tools such as `read-song` and `write-song`. Make sure `ableton-live` and all these tools are
     enabled (they should be enabled by default, unless you disable them).

## Usage Examples

- Start a chat like:

  > What is the state of Ableton Live?

- Setup a drum rack in a track called "Drums" and ask:

  > Find the Drums track and generate a 4-bar drum loop

- Setup some pads or keys in a track called "Chords" and ask:

  > In the Chords track, generate a 4-chord progression of whole notes in C minor

- Then:

  > In the Bass track, generate a bassline to go along with that chord progress

- Let the AI tell you what else it can do:

  > What are all the things you can do with your Ableton Live tools?
