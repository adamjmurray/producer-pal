# Ableton Producer Pal

A Max for Live device for Ableton Live that enables collaborative music
production with an AI assistant such as
[Anthropic Claude](https://www.anthropic.com/claude).

## ⚠️ Important Notices

**🧪 EXPERIMENTAL SOFTWARE**: This is alpha software under active development.
Always save and backup your Live sets before use. The software may cause
crashes, data loss, or unexpected behavior.

**🔒 PRIVACY**: Your musical data (MIDI notes, track names, tempo, etc.) is
transmitted to Anthropic's Claude AI service for processing. Review
[Anthropic's privacy policy](https://www.anthropic.com/privacy) before use. Do
not use with confidential or commercially sensitive musical content.

**💰 USAGE COSTS**: While the Producer Pal itself is free, it requires Claude AI
access which may incur costs. Monitor your Anthropic usage to avoid unexpected
charges. Free accounts have usage limits.

## Goals and Use Cases

- Supplement, complement, and enhance human creativity. Humans stay involved and
  retain control.

- Get unblocked when creatively blocked. Get started when you don't know where
  to start.

- Experiment with music in terms of high-level ideas instead of the low-level
  piano roll events. Try things you never tried before.

- Hands-on learning for music theory, composition, and arrangement. Go as deep
  (or shallow) as you want.

- Help people with disabilities make music. Empower people to do things they
  thought they could never do.

  _The possibility of hands-free voice control is promising for people who can't
  use a standard mouse/trackpad and keyboard, but voice control is not
  (directly) supported in Claude Desktop at this time. There is potential to
  help people with neurodiversity and cognitive impairments who struggle with
  the complexity of Ableton Live._

## Requirements

To use the Producer Pal, you must have the following software installed:

- **Operating System**: macOS 10.15+ or Windows 10+ (tested on macOS 14+ and
  Windows 11)
- **[Ableton Live 12.2+](https://www.ableton.com/live/)** with
  **[Max for Live](https://www.ableton.com/live/max-for-live/)** (e.g. Ableton
  Live Suite edition)
- **[Claude Desktop](https://claude.ai/download)** (latest version recommended)
- **[Node.js](https://nodejs.org/)** LTS version (v18-v22 tested). Add Node.js
  to your PATH if given the option when installing.

**System Resources**:

- Minimum 4GB RAM (8GB+ recommended for complex projects)
- Network connection required for AI communication

The Producer Pal should work with a free Anthropic account. You may hit usage
limits quickly on a free account, but you shouldn't need to pay for a
subscription to try it.

In theory, any [MCP-compatible](https://modelcontextprotocol.io/) AI chat client
could be used instead of Claude Desktop, but only Claude Desktop is officially
supported at this time.

Node.js is currently required as an adaptor between Claude Desktop and the
Producer Pal Max for Live device. It will hopefully be unnecessary in the
future.

## Installation

1. Download the latest release of the Producer Pal (TODO LINK )
2. **⚠️ BACKUP YOUR WORK**: Save any important Live sets before proceeding
3. Add the `Producer Pal.amxd` file to an Ableton Live project. It should show
   that it is running: TODO screenshot
4. Configure Claude Desktop to connect to the Producer Pal

   - Go to Claude Desktop → Settings → Developer → Edit Config → Open
     `claude_desktop_config.json` in a text editor
   - Copy the settings from the Producer Pal Max for Live device into
     `claude_desktop_config.json`. It should look something like this (the port
     number will be different if you had to change it):

   ```json
   {
     "mcpServers": {
       "Ableton Producer Pal": {
         "command": "npx",
         "args": ["-y", "mcp-remote@0.1.14", "http://localhost:3350/mcp"]
       }
     }
   }
   ```

5. Restart Claude Desktop.

   _Note: on Windows, closing the Claude Desktop window does not restart the
   program. You must find the Claude icon in the system tray and select "Exit
   Claude" from there._

### Confirming the installation was successful

After restarting Claude Desktop, in the "Search and Tools" button below the chat
input, you should see `Ableton Producer Pal` and if you click into that, there
should be 15 tools listed such as `transport`, `read-song`, and `update-song`
(see below for an explanation of what these tools can do).

Make sure `Ableton Producer Pal` and its tools are enabled in Claude Desktop
before proceeding (they should be enabled by default, unless you manually
disable them). If you can't see them or they aren't enabled, nothing will work.

TODO: Show screenshots of "Ableton Producer Pal" in the Claude Desktop tools
list.

### Troubleshooting

**Claude Desktop won't connect / shows errors**:

- Try using the absolute path to the `npx` command:
  - macOS: `"/usr/local/bin/npx"`
  - Windows: `"C:\\Program Files\\nodejs\\npx.cmd"`
- Ensure Node.js is properly installed and in your PATH
- On Windows, completely restart Claude Desktop (Exit from system tray)

**"Port already in use" errors**:

- Change the port number in both the Max device and Claude Desktop config

**Tools not appearing in Claude Desktop**:

- Verify the JSON syntax in `claude_desktop_config.json`
- Restart Claude Desktop completely
- Check that the Producer Pal device shows "Connected" status in Live

**Max for Live crashes or errors**:

- Ensure you're using Ableton Live 12.2+
- Try creating a new, minimal Live set for testing
- Check Console/Event Viewer for error details

**Performance issues**:

- Close unnecessary applications
- Use smaller Live sets when possible
- Avoid extremely complex MIDI patterns initially

## Usage

**⚠️ SAFETY FIRST**: Always save your work before letting AI modify your Live
set. Producer Pal can overwrite and delete clips, tracks, and other data.

As mentioned in the [Limitations](#limitations) section below, the Producer Pal
cannot create instruments or work with audio clips. Before chatting with the AI,
you should setup one or more MIDI instrument tracks. If you have a MIDI-focused
template for new songs, try using that. A good starting point might include
drums, bass, chords, and a lead track, but this depends on your musical goals.

### AI Settings

It's recommended to use Claude Sonnet 4.

Claude Opus 4 is probably overkill and will reach usage limits faster, but feel
free to try it for complex tasks.

### Starting a new chat

_Note: Producer Pal appears to only work in normal Claude chats in Claude
Desktop, not inside Claude Projects. Start a new chat outside of any project._

Here's a good way to let Claude know you want to use the Ableton Producer Pal in
this conversation:

> Let's play with Ableton Live

or

> Tell me the current state of Ableton Live on my computer

"on my computer" avoids doing a web search for news on Ableton Live. If these
phrases don't work, try "Use your tools to ..." or "Use your Producer Pal tools
to ..." to nudge it to actually use Producer Pal.

#### Learning how to use Producer Pal

You can just talk to the AI and it will help you figure things out. To
understand what it can do, ask:

> Give a detailed list of all the Ableton Live tools and features available to
> you

Try whatever interests you. You can ask it for more details about how to use
specific features.

#### Example Use Cases

- Setup a drum rack in a track called "drums" and ask:

  > Find the drums track and generate a 4-bar drum loop

- Setup a lead instrument in a track called "lead" and ask:

  > Find the lead track and generate a melody

- Setup some pads or keys in a track called "chords" and ask:

  > Find the chords track and generate a 4-chord progression of whole notes in C
  > minor

  - Then, setup a bass track:

    > Find the bass track and generate a bassline to go along with that chord
    > progression

These are some basic ideas to get you started. For best results, be very
specific and detailed about what you want. Instead of "generate a melody", try:

> Generate an 8-bar EDM-style synthesizer melody in the key of C major with a
> mix of whole notes, half notes, quarter notes, and eighth notes. Use some
> dotted rhythms and syncopation too. Keep the center of the melody around the C
> above middle C.

If you don't know enough about music theory to ask for things like this, try
asking the AI for help learning music theory. Or just describe it the best you
can and chat back and forth as needed to clarify. Find your own way to interact
with it based on your unique perspective. For example, if you aren't sure how to
ask for specific aspects of a melody, you could ask things like "What makes a
good melody in [some genre]?", chat about that topic, and then ask "Show me an
example of a melody like that in the lead track in Ableton Live".

### Tips

**Always keep backups and save often!** Don't let AI loose on a serious song you
care about unless you've saved a backup copy. Producer Pal can overwrite and
delete things. If you make good progress, save it before you lose it.

If Claude is making mistakes or you are asking for something particularly
complex, try the "extended thinking" feature. This works with both the Sonnet
and Opus models. Note this is probably overkill most of the time and will reach
usage limits faster, so it's recommended to leave it off until you need it.

Keep your context window small for best results. In practical terms, that means:
If you have a very long conversation, consider starting a new conversation.
Claude can easily re-read the state of Ableton Live in a new conversation (just
say "Let's play with Ableton Live" again). If you want to maintain context from
the old conversation, ask Claude to summarize the current conversation and copy
and paste the summary into a new conversation.

To help keep your context window small, it's recommended to use standalone
conversations by default and not use a Claude Project. However, you may find
value in setting up a focused Claude Project for specific musical goals, for
example, by specifying some music theory rules in the Claude Project
instructions or knowledge base.

## Limitations

- **No device manipulation features**. You must setup all instruments and
  effects yourself.
  - Workaround: Once a MIDI instrument track is setup, you can ask the Producer
    Pal to duplicate the track, which will duplicate all instruments and effects
    in the track.
- **No audio support**. The Producer Pal can see and manipulate audio tracks,
  but cannot do anything useful with audio clips.
- **Network dependency**: Requires internet connection for AI communication
- **Performance**: Large Live sets may cause slower response times
- **Complex time signatures**: Some edge cases with unusual time signatures may
  not work correctly

## Known Issues

- Using the Producer Pal in an Ableton Live template may cause Ableton to crash
  when loading that template. You may need to
  [reset your default Live template](https://help.ableton.com/hc/en-us/articles/209773265-Troubleshooting-a-crash#h_01HCFQ56MG8QVWC78FWANX5KWP)
  if you save Producer Pal into it.

## Security and Privacy

- All musical data is transmitted to Anthropic's servers
- Producer Pal runs a local HTTP server (default port 3350) for communication
- No data is stored locally by Producer Pal beyond the current session
- Review Anthropic's data handling policies before using with sensitive content

## Feature Reference

You can simply ask the AI what it can do with Producer Pal / its Ableton Live
tools. For reference, here is a list of all the tools and their features:

### `transport` tool

Controls playback in both Arrangement and Session views via various actions:

- `play-arrangement` - Start arrangement playback from a specified position
- `update-arrangement` - Modify arrangement loop and track follow settings
  without affecting playback
- `play-scene` - Launch all clips in a Session view scene
- `play-session-clip` - Trigger specific clips in Session view
- `stop-track-session-clip` - Stop Session clips in specific tracks
- `stop-all-session-clips` - Stop all Session view clips
- `stop` - Stop all playback

### `read-song` tool

Returns comprehensive Live Set information including:

- Ableton Live version
- Song name
- Current view (Session/Arranger)
- Playback state and tempo
- Time signature
- Scale settings (mode, root note, intervals)
- All tracks with their clips
- All scenes

### `update-song` tool

Updates global song properties:

- Tempo (20-999 BPM)
- Time signature (e.g., "4/4")
- View switching (Session/Arranger)

### `create-scene` tool

Creates scenes at specified index with the given:

- name, color, tempo, and time signature (or follow the song's tempo/time
  signature)

### `read-scene` tool

Retrieves scene information:

- Name, color, tempo, time signature
- Playing/triggered state
- Clip details for all tracks in the scene

### `update-scene` tool

Updates existing scenes:

- Modify name, color, tempo, time signature
- Disable scene tempo/time signature to follow the song's tempo/time signature
- Bulk operations with comma-separated IDs

### `capture-scene` tool

Captures currently playing clips as a new scene below the selected scene.

### `create-track` tool

Creates MIDI or audio tracks:

- Insert at specified index
- Set initial mute/solo/arm states

### `read-track` tool

Returns comprehensive track information:

- Type (MIDI/audio), name, color
- Mute/solo/arm states
- Playing/fired clip indices
- All Session and Arranger clips
- Drum pad information in tracks containing drum racks (so it's known that e.g.
  pitch C1 triggers the 808 kick)

### `update-track` tool

Updates existing tracks by ID:

- Modify name, color, mute/solo/arm states
- Bulk operations with comma-separated IDs

### `create-clip` tool

Creates MIDI clips in Session or Arrangement view:

- Generate MIDI clips with full support for pitch, timing, velocity, velocity
  ranges, and note probability
- Time is represented as bars and beats respecting the current time signature,
  allowing for longer, more complex rhythmic patterns to be handled accurately
- Works with Session and Arranger clips
- Autoplay option for Session clips
- Auto-creates scenes if needed (Session view)
- Sequential placement for multiple clips

### `read-clip` tool

Retrieves clip information:

- Type (MIDI/audio), name, color
- MIDI notes in readable notation format with time represented as bars and beats
- Loop settings
- Works with Session and Arranger clips

### `update-clip` tool

Updates existing clips by ID:

- Update the pitches, timing, velocities, velocity ranges, and note
  probabilities of MIDI clips
- Time is represented as bars and beats respecting the current time signature,
  allowing for longer, more complex rhythmic patterns to be handled accurately
- Modify name and color
- Modify loop setting
- Modify time signature
- Works with Session and Arranger clips
- Bulk operations with comma-separated IDs

### `delete` tool

Deletes objects by ID and type:

- Delete tracks, scenes, or clips
- Bulk deletion with comma-separated IDs

### `duplicate` tool

Duplicates objects with advanced options:

- Tracks: Sequential duplication
- Scenes: To Session or Arranger view
- Clips: To Session slots or Arranger timeline
- Precise timing control for Arranger placement

### Custom Music Notation

All clip and time-related operations support a custom notation format designed
for use by AI.

Pitches are named as they appear in the piano roll, so middle C is "C3", and the
AI understands this. You can spell out note names like C, Eb, F# talk to the AI
about pitches this way.

Time is represented in bar:beat syntax where bars are whole numbers and beats
can have fractions. 1:1 is the start of the song/clip: the first beat of the
first measure. 2:1.5 is the second measures, one half beat past the start of the
measure. The number of beats per measure is determined from the time signature.
Note that every clip can have its own time signature. Arrangement view song
positions are in terms of the song's time signature, and new clips will default
to using the song's time signature.

Generally, you can speak naturally about clip and song positions in terms of
bars and beats, such "add a drum fill at the end of every four bars", or
"generate a new clip in bar 5 of the arrangement". You can also try using the
bear:beat format directly if you want, such as "generate a clip in the
arrangement at 17:2-21:2".

## License

This software is licensed for personal, educational, and non-commercial use
only. See the LICENSE.md file for full terms.

## Support and Issues

- **Bug Reports**: [GitHub Issues](TODO: ADD LINK)
- **Documentation**: [GitHub Wiki](TODO: ADD LINK)
- **Community**: [Discord/Forum](TODO: ADD LINK)

When reporting issues, please include:

- Operating system and version
- Ableton Live version
- Node.js version
- Steps to reproduce the issue
- Any error messages from Claude Desktop or Ableton Live
