# Usage Examples

Once you have [installed Producer Pal](/installation), here are some examples of
how to use it.

## Getting Started

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

## Shaping the Feel

Once you have a pattern, you can shape its dynamics, timing, and articulation.

### Velocity Dynamics

Add expression and movement to your patterns:

> add a crescendo to the hats in the last two beats of the last bar

> apply a velocity LFO to the hats

> slightly randomize the snare velocities

These work on any MIDI clip — drums, melodies, chords — and can target specific
notes by pitch or time range.

### Swing & Quantize

Dial in the rhythmic feel:

> add swing to the closed hats

> that's a little too much, lower the amount of swing

> I changed my mind, quantize the hats to the 16th note grid

### Note Duration

Control note lengths for different articulations:

> cut all the note durations in half

> apply legato to the melody

## Building Musical Structure

### Melodic Development

Build variations from a simple idea using scale-aware transposition:

> extend the 2-bar melody into an 8-bar melody by copying the bars so each
> repetition can be edited independently

> in the 3rd and 4th bar, raise the pitches by one scale step. In the 5th and
> 6th, raise by three scale steps, and raise the final repetition by four scale
> steps

This creates a melody that builds upward through the scale across repetitions —
a common technique for creating tension and arc in a phrase.

### Arrangement Workflow

Build song structure in the arrangement view:

> create an 8-bar bass line on the Bass track in the arrangement starting at bar
> 5

> duplicate that clip to bar 13

> split the clip at bar 9

### Layer Multiple Patterns on One Instrument

You can route multiple MIDI tracks to control the same instrument, enabling
complex rhythms and polyrhythmic patterns.

#### Layered Drum Parts

- Create a basic kick pattern
- Say "layer another track onto the drums"
- Add snares to the new track
- Create another layer for hats
- Launch different clip combinations for dynamic arrangements

#### Polyrhythmic Patterns

- Make a 3-bar melody pattern
- Say "layer another track onto [track name]"
- Ask for a 4-bar clip in the new track
- The patterns phase every 12 bars, creating evolving variations

## Track & Device Setup

Set up your whole signal chain conversationally:

> create a MIDI track called "Synth Lead"

> add a Wavetable instrument to it

> set the filter cutoff to 50%

> mute that track and set its color to purple

## Working with Audio Samples

Browse and use audio files from your sample library:

> show me available drum samples

> create an audio clip using the kick sample on the Drums track

> pitch shift it up 5 semitones and loop it

## Project Memory

Save notes that persist across conversations — useful for keeping track of
musical decisions:

> save a note: "this project uses C minor with jazzy 7th chords"

Later, in a new conversation:

> what notes do I have saved about this project?

## Session and Arrangement Views

Producer Pal works in both Session and Arrangement views. Use Session for
jamming and ideas, then move to Arrangement for song structure — or start
directly in Arrangement if you prefer.

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
