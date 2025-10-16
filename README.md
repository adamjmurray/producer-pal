# <sub><img src="./doc/img/producer-pal-logo.svg" height="40"/></sub> Producer Pal

AI music production assistant for Ableton Live.

Works with most AI that support tools, including Claude, Gemini, OpenAI GPT, and
local models.

**→ [Install it now](./INSTALLATION.md)** or see what's new in
[the latest releases](https://github.com/adamjmurray/producer-pal/releases/).

## Demo

Watch the Producer Pal 1.0 walkthrough video:

- 0:00:
  [Installation with Claude Desktop](https://www.youtube.com/watch?v=IB19LqTZQDU&list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX)
- 2:29:
  [Connecting the AI to Ableton](https://www.youtube.com/watch?v=IB19LqTZQDU&list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX&t=149s)
- 3:23
  [Generating a 4-part, 8-bar loop from scratch](https://www.youtube.com/watch?v=IB19LqTZQDU&list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX&t=202s)

<a href="https://www.youtube.com/watch?v=IB19LqTZQDU&t=202s">
<figure>
    <img
    src="https://img.youtube.com/vi/IB19LqTZQDU/0.jpg"
    alt="Producer Pal demo video thumbnail" />
  <br>
  <figcaption>Watch Producer Pal create a 4-part, 8-bar loop from scratch.</figcaption>
  <br>
</figure>
</a>

Or
[watch how to setup Producer Pal with Gemini CLI.](https://www.youtube.com/watch?v=jd3wTdDqd4Y&list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX)

## Installation

Follow the [Installation Guide](./INSTALLATION.md) to connect Producer Pal to
your AI:

- [Claude Desktop](./INSTALLATION.md#claude-desktop)
- [Gemini CLI](./INSTALLATION.md#gemini-cli)
- [More options...](./INSTALLATION.md)

Then, see the [Usage Guide](#usage) for help getting started.

## Support

- **Feedback, Feature Ideas, General Discussion**:
  [GitHub Discussions](https://github.com/adamjmurray/producer-pal/discussions)
- **Bugs & Problems**: Report in
  [the bug reports forum](https://github.com/adamjmurray/producer-pal/discussions/categories/bug-reports)
  or [issues list](https://github.com/adamjmurray/producer-pal/issues)
- **Documentation**:
  [GitHub Homepage (this page)](https://github.com/adamjmurray/producer-pal/#readme)
  and [the dedicated area of my website](https://adammurray.link/producer-pal/)

If you want to support Producer Pal development, ⭐️ star
[the GitHub repository](https://github.com/adamjmurray/producer-pal) to help
others discover the project.

## Data Privacy

When using online AI services, your musical data (MIDI notes, track names,
tempo, etc.) is sent to that service for processing. Most services offer options
to opt out of training on your data. Check your AI provider's privacy policy and
account settings. Avoid online services for highly confidential or commercially
sensitive work.

## Usage

### Basic Examples

- Start a chat like:

  > connect to ableton

  If Ableton Live or the Producer Pal Max for Live device aren't running, the AI
  will let you know. Once it's running, say "try again" or restart the
  conversation.

- Setup a drum rack in a track called "Drums" and ask:

  > find the drums track and generate a 4-bar drum loop

  then:

  > I like that, make some variations

  or:

  > great! can you expand that to 16 bars?

  or:

  > it's pretty repetitive, can you add some drum fills on the last few beats?

  or:

  > that's not quite what I'm looking for, do something more like ...

  the better you can describe exactly what you want, the better the results
  should be.

- Setup some pads or keys in a track called "Chords" and ask:

  > in the chords track, generate a 4-chord progression of whole notes

  Enable the global scale for your Live Set and Producer Pal should respect it
  when generating chords, bass, and melodies. Or tell it what scale to use.

- Then (with a "Bass" track):

  > in the bass track, generate a bassline to go along with that chord
  > progression

- Let the AI tell you what else it can do:

  > what are all the things you can do with your Ableton Live tools?

### Session and Arrangement views

Producer Pal works in both Session and Arrangement views. Use Session for
jamming and ideas, then move to Arrangement for song structure—or start directly
in Arrangement if you prefer.

### Limitations

Producer Pal is focused on generating and manipulating MIDI clips.

It cannot (yet) manage devices (instruments or effects) in your tracks. You must
add and adjust all devices yourself. Note that it can duplicate tracks,
including all the track's devices.

It cannot work with audio clips beyond some general features like deleting and
duplicating clips (it cannot add new audio clips or create audio from scratch).

Drum Racks work in nested structures, but tracks with multiple Drum Racks only
use the first one's drum map. Use one Drum Rack per track for predictable
results.

### More Examples

Above are some basic ideas to get you started. For best results, be very
specific and detailed about what you want. Instead of "generate a melody", try:

> Generate an 8-bar EDM-style synthesizer melody in the key of C major with a
> mix of whole notes, half notes, quarter notes, and eighth notes. Use some
> dotted rhythms and syncopation too. Keep the center of the melody around the C
> above middle C.

If you don't know enough music theory to ask specifically, describe what you
want in your own words and iterate with the AI. Or ask it to teach you music
theory concepts. It can also perform web searches to research genres and
techniques.

### Layer Multiple Patterns on One Instrument

You can route multiple MIDI tracks to control the same instrument, enabling
complex rhythms and polyrhythmic patterns.

#### Layered drum parts

- Create a basic kick pattern
- Say "layer another track onto the drums"
- Add snares to the new track
- Create another layer for hats
- Launch different clip combinations for dynamic arrangements

#### Polyrhythmic patterns

- Make a 3-bar melody pattern
- Say "layer another track onto [track name]"
- Ask for a 4 bar clip in the new track
- The patterns phase every 12 bars, creating evolving variations

### Tips

For a full feature reference see [FEATURES.md](./FEATURES.md).

**Always keep backups and save often!** Don't let AI loose on a serious song you
care about unless you've saved a backup copy. Producer Pal can overwrite and
delete things. If you make good progress, save it before you lose it.

Keep your context window small for best results: start fresh conversations when
needed (just say "connect to ableton" again), or use the project notes feature
in the Max device to persist important context. For particularly complex tasks,
"extended thinking" or "high reasoning effort" features can help, though it's
typically overkill and will hit usage limits faster.
