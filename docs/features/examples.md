---
title: Usage Examples
description:
  What to say to Producer Pal — setting up project context, reading and
  reorganizing your Live Set, building tracks and devices, editing MIDI you
  already have, arranging, and working with samples.
---

# Usage Examples

Producer Pal is an assistant for the Live Set you're already working on. It can
write MIDI from scratch, but that's the smallest part of what it does — it also
reads your Set, sets up tracks and devices, edits what's already there, arranges
clips, and finds samples.

These are examples of what to say, once you have
[installed Producer Pal](/installation).

## Start here

### Connect to Ableton

Start a chat like:

> connect to ableton

If Ableton Live or the Producer Pal Max for Live device aren't running, the AI
will say so. Once it's running, say "try again" or start a new conversation.

### See what it can do

Let the AI tell you itself:

> what are all the things you can do with your Ableton Live tools?

### Look around your Set

Nothing is generated here — this is just Producer Pal reading:

> what's in my Live Set?

> what devices are on the bass track, and how are they set?

> which clips are in scene 3?

## Set up project context

This is the highest-leverage thing you can do, and the easiest to skip. Producer
Pal remembers things in [three layers](/guide/context): **project context**
(what this Set is), **global context** (what you always want), and **memory**
(what the AI has learned about you). All three are sent on every conversation,
so the AI starts out knowing your project instead of asking.

You can write them by hand in the
[context editor](/guide/context#the-context-editor), or just tell the AI:

> save this to the project context: this track is a 140bpm neurofunk tune in F
> minor. "Reese" is the main bass track and its patch should never be
> retriggered mid-phrase. Keep the intro sparse.

> add to the project context: the arrangement is intro (1-16), drop (17-48),
> breakdown (49-64)

Project context travels with the Live Set — it's stored in the device, so it's
there when you reopen the project tomorrow.

For things that are true of everything you make, use global context instead:

> remember globally: I work in 4-bar loops, I hate hard-quantized hi-hats, and I
> never want you to touch my master chain

Then in a new conversation, days later:

> what do you know about this project?

::: tip Project vs. global

"Kick stays four-on-the-floor in this tune" is project context. "I always work
in A minor" is global. If you'd want it in your next Set too, it's global.

:::

The AI also writes [memory](/guide/context#memory) entries on its own as it
picks up on your preferences, and you can ask it to:

> remember that I like my snares layered with a clap about 10ms late

## Build tracks and devices

Set up a signal chain conversationally:

> create a MIDI track called "Synth Lead"

> add a Wavetable instrument to it

> set the filter cutoff to 800 Hz and add an Echo after it

> mute that track and set its color to purple

Producer Pal knows Live's native devices, including
[device-specific controls](/features/tools#ppal-update-device) for Drift,
Wavetable, Simpler, Meld, Compressor, EQ Eight, Hybrid Reverb, Roar, and
Spectral Resonator.

## Work with samples

Browse and use audio from your library:

> show me available drum samples

> find me a rhodes loop

> create an audio clip using that kick sample on the Drums track

> pitch shift it up 5 semitones and loop it

## Edit what you already have

Most work isn't generating a part — it's fixing the one that's there. These all
operate on existing MIDI, using
[transforms](/features/midi-notation#transforms):

**Feel and timing:**

> add swing to the closed hats

> that's a little too much, lower the amount of swing

> quantize the hats to the 16th note grid, but leave the kick alone

**Dynamics:**

> add a crescendo to the hats in the last two beats of the last bar

> slightly randomize the snare velocities

> apply a velocity LFO to the hats

**Articulation:**

> cut all the note durations in half

> apply legato to the melody

These work on any MIDI clip — drums, melodies, chords — and can target notes by
pitch or time range.

## Arrange

Build song structure in the Arrangement view:

> copy the session drum loop to the arrangement at bar 17 and repeat it to bar
> 48

> duplicate that clip to bar 13

> split the clip at bar 9

> add a locator called "drop" at bar 17

Producer Pal works in both Session and Arrangement views. Use Session for
jamming and ideas, then move to Arrangement for song structure — or start
directly in Arrangement if you prefer.

## Generate parts

When you do want the AI to write MIDI, be specific — the better you describe
what you want, the better the result:

> in the chords track, generate a 4-chord progression of whole notes

> generate a bassline to go along with that chord progression

> I like that, make some variations

> it's pretty repetitive, can you add some drum fills on the last few beats?

Set a scale and key on your Live Set and Producer Pal respects it when
generating chords, bass, and melodies — or just tell it what scale to use.

### Melodic development

Build variations from a simple idea using scale-aware transposition:

> extend the 2-bar melody into an 8-bar melody by copying the bars so each
> repetition can be edited independently

> in the 3rd and 4th bar, raise the pitches by one scale step. In the 5th and
> 6th, raise by three scale steps, and raise the final repetition by four scale
> steps

This builds a melody that climbs through the scale across repetitions — a common
way to create tension and arc in a phrase.

### Layering multiple patterns on one instrument

You can route multiple MIDI tracks to the same instrument, for complex or
polyrhythmic patterns:

- **Layered drums** — create a kick pattern, say "layer another track onto the
  drums", add snares there, then another layer for hats. Launch different clip
  combinations for dynamic arrangements.
- **Polyrhythms** — make a 3-bar pattern, layer another track onto it, and ask
  for a 4-bar clip in the new track. The two phase against each other every 12
  bars.

## Tips

**Always keep backups and save often.** Don't let AI loose on a serious song you
care about unless you've saved a backup copy. Producer Pal can overwrite and
delete things. If you make good progress, save it before you lose it.

**Keep the context window small.** Start fresh conversations when a chat gets
long (just say "connect to ableton" again) — and put anything worth keeping into
[project context or memory](/guide/context) so a new conversation starts
informed instead of re-explaining.

**Reach for reasoning sparingly.** For particularly complex tasks, "extended
thinking" or "high reasoning effort" can help, though it's typically overkill
and burns usage limits faster.

For the full feature reference see the [Features page](/features), and for known
constraints see [Limitations](/features/limitations).
