# Usage Examples

Once you have [installed Producer Pal](/installation), here are some examples of
how to use it.

## Basic Examples

### Connecting to Ableton

Start a chat like:

> connect to ableton

If Ableton Live or the Producer Pal Max for Live device aren't running, the AI
will let you know. Once it's running, say "try again" or restart the
conversation.

### Creating Drum Patterns

Setup a drum rack in a track called "Drums" and ask:

> find the drums track and generate a 4-bar drum loop

then:

> I like that, make some variations

or:

> great! can you expand that to 16 bars?

or:

> it's pretty repetitive, can you add some drum fills on the last few beats?

or:

> that's not quite what I'm looking for, do something more like ...

The better you can describe exactly what you want, the better the results should
be.

### Generating Chord Progressions

Setup some pads or keys in a track called "Chords" and ask:

> in the chords track, generate a 4-chord progression of whole notes

Enable the global scale for your Live Set and Producer Pal should respect it
when generating chords, bass, and melodies. Or tell it what scale to use.

### Creating Basslines

With a "Bass" track:

> in the bass track, generate a bassline to go along with that chord progression

### Discovering More Features

Let the AI tell you what else it can do:

> what are all the things you can do with your Ableton Live tools?

## Session and Arrangement Views

Producer Pal works in both Session and Arrangement views. Use Session for
jamming and ideas, then move to Arrangement for song structure—or start directly
in Arrangement if you prefer.

## Layer Multiple Patterns on One Instrument

You can route multiple MIDI tracks to control the same instrument, enabling
complex rhythms and polyrhythmic patterns.

### Layered Drum Parts

- Create a basic kick pattern
- Say "layer another track onto the drums"
- Add snares to the new track
- Create another layer for hats
- Launch different clip combinations for dynamic arrangements

### Polyrhythmic Patterns

- Make a 3-bar melody pattern
- Say "layer another track onto [track name]"
- Ask for a 4 bar clip in the new track
- The patterns phase every 12 bars, creating evolving variations

## Advanced Examples

The basic examples above are a good starting point. For best results, be very
specific and detailed about what you want. Instead of "generate a melody", try:

> Generate an 8-bar EDM-style synthesizer melody in the key of C major with a
> mix of whole notes, half notes, quarter notes, and eighth notes. Use some
> dotted rhythms and syncopation too. Keep the center of the melody around the C
> above middle C.

If you don't know enough music theory to ask specifically, describe what you
want in your own words and iterate with the AI. Or ask it to teach you music
theory concepts. It can also perform web searches to research genres and
techniques.

## Tips

For a full feature reference see the [Features page](/features).

**Always keep backups and save often!** Don't let AI loose on a serious song you
care about unless you've saved a backup copy. Producer Pal can overwrite and
delete things. If you make good progress, save it before you lose it.

Keep your context window small for best results: start fresh conversations when
needed (just say "connect to ableton" again), or use the memory feature in the
Max device to persist important context. For particularly complex tasks,
"extended thinking" or "high reasoning effort" features can help, though it's
typically overkill and will hit usage limits faster.

## Limitations

Drum Racks work in nested structures, but tracks with multiple Drum Racks only
use the first one's drum map. Use one Drum Rack per track for predictable
results.
