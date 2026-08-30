---
title: More Than a Live API Wrapper
description:
  Producer Pal isn't a thin pass-through to the Ableton Live API. It smooths
  over the API's rough edges and adds capabilities the API doesn't offer at all.
---

# More Than a Live API Wrapper

Most projects that connect an AI to Ableton Live are **thin wrappers**: they
take the Live API more or less as-is and forward its calls to the model. That's
easy to build, but every rough edge of a low-level, decade-old API lands on the
AI, and the AI passes that friction on to you.

Producer Pal has been refined since the beginning of 2025. Every time the AI
stumbled over an awkward interface, a confusing value, or a missing capability,
that edge got smoothed over. Here's what that looks like in practice.

## Colors as `#RRGGBB`

Ask the Live API for a track or clip color and you get back a number, something
like `16711680`. To set a color, you hand it a number too. It's a **packed
24-bit integer**: red, green, and blue each get one byte (`0x00RRGGBB`).
Perfectly logical for a C++ engine. Nobody thinks _"bright red"_ and reaches for
`16711680`.

Producer Pal uses the **`#RRGGBB` hex syntax** everyone knows from CSS and does
the bit math on both sides of the boundary
([`live-api-extensions.ts`](https://github.com/adamjmurray/producer-pal/blob/main/src/live-api-adapter/live-api-extensions.ts)):

```js
// Live API integer → "#RRGGBB"
const r = (colorValue >> 16) & 0xff;
const g = (colorValue >> 8) & 0xff;
const b = colorValue & 0xff;

// "#RRGGBB" → Live API integer
this.set("color", (r << 16) | (g << 8) | b);
```

So you can ask for _"make the drums dark purple"_ and it just works.

There's a wrinkle. Live snaps colors to a **fixed palette of about 70
swatches**, so the color you ask for isn't always the color you get. A thin
wrapper hands back a different number and leaves the AI confused. Producer Pal
reads the color back after setting it, and when Live has quantized it, says so
([`color-verification-helpers.ts`](https://github.com/adamjmurray/producer-pal/blob/main/src/tools/shared/color-verification-helpers.ts)):

> Requested clip color #FF0000 was mapped to nearest palette color #FF3636. Live
> uses a fixed color palette.

## Device knobs in real units

Colors are a clean translation: one integer in, one hex string out. Device
parameters look like the same problem and turn out not to be.

Ask the Live API for a Saturator's **Drive** and you get `0.5`. Not decibels: a
raw number between 0 and 1, mapped onto the displayed range of -36 to +36 dB by
a curve Live never describes anywhere. There's no `set_display_value` to write
the number you actually want. Live _will_ render a raw value for you
(`str_for_value`), but that's read-only: it answers _"what would `0.53` look
like?"_, never _"what raw value shows `2.3 dB`?"_

So Producer Pal asks the first question over and over until it has answered the
second. A binary search walks the raw range, calling Live's own renderer at each
step, until it brackets the display value that was asked for
([`param-display-search.ts`](https://github.com/adamjmurray/producer-pal/blob/main/src/tools/device/update/helpers/param-display-search.ts)).

That gets you close. Landing exactly takes three more details, each of which was
a real bug first:

**Aim at the middle of a step, not its edge.** A displayed value isn't a point
in raw space, it's a window. On that Saturator, `2.3 dB` covers raw `0.5312505`
to `0.5326385`, about one part in seven hundred of the knob's travel. The search
converges on the _edge_ of that window, and Live then snaps whatever you write
to its own resolution (32-bit float at best). Either nudge is enough to tip you
into the neighboring window, and the knob reads back `2.2`. So a second search
finds the window's far edge, and Producer Pal writes the midpoint: `0.5319450`,
as far from either edge as it can get.

**Round to the nearest reachable step.** Live's display resolution isn't
uniform. That same Drive knob moves in 0.1 dB steps up to 10 dB and 1 dB steps
above it, so `10.5 dB` is a value Live will never print, whatever you write.
Asking for it gets you 10 or 11, whichever is nearer, rather than always down.

**Check the write landed at all.** Hand Live a value outside a parameter's range
and it doesn't clamp it. It silently _ignores_ you and leaves the knob where it
was. So every parameter write is read back afterward, and one that didn't take
says so
([`param-write-helpers.ts`](https://github.com/adamjmurray/producer-pal/blob/main/src/tools/shared/device/helpers/param-write-helpers.ts)):

> param "Drive" was not changed. It still reads "0.0 dB". Live ignores a value
> outside the parameter's range.

### What "the range" even is

Reading a parameter back has its own version of the problem. The API's `min` and
`max` are raw, `0` and `1`, which tells the AI nothing about what it's allowed
to ask for. There's no unit property either: dB, Hz, ms, semitones, `%` are all
inferred from the text of the rendered label.

Then there are the knobs that stop being a number line at one end. Glue
Compressor's **Release** runs from `0.1` up to `1.2` and then reads **`A`**, for
Auto. Compressor's **Ratio** starts at **`inf : 1`** before it becomes `1`, `2`,
`4`. Take those labels as the ends of the range and the numbers vanish; ignore
them and a real setting becomes unreachable.

So Producer Pal finds where the numbers actually stop, reports that as the
range, and names the odd one out separately
([`param-numeric-range.ts`](https://github.com/adamjmurray/producer-pal/blob/main/src/tools/shared/device/helpers/param-numeric-range.ts)):

```json
{
  "name": "Release",
  "value": 0.6,
  "min": 0.1,
  "max": 1.2,
  "alsoAccepts": "A"
}
```

The AI can now see the whole knob: the numbers it can interpolate over, and the
one word it has to ask for by name.

## Splitting clips in the Arrangement

In Live's UI you hit **⌘E** to cut a clip in two. The Live API exposes **no
split operation at all**. There is no `split_clip`, and the properties you'd
reach for to fake it are walled off:

- You can't shorten a clip by writing its `end_time`. For warped, looped clips
  the arrangement length is effectively **immutable** once the clip exists.
- You can't create an audio clip _in the arrangement_ with a specific length.
  `Track.create_audio_clip` takes a position but no length; only Session view's
  `ClipSlot.create_audio_clip` can be sized after the fact.
- The one lever that does move clips around, dropping a new clip so it
  **overlaps** an existing one, only trims from the **edges**. If a new clip
  overlaps the _middle_ of an existing one, Live truncates at the overlap and
  **throws away everything after it**. It does not split into a "before" and an
  "after." (These constraints are documented in the project's
  [Arrangement-Operations](https://github.com/adamjmurray/producer-pal/blob/main/dev/Arrangement-Operations.md)
  notes, hard-won by probing real Ableton behavior.)

So Producer Pal builds split out of the one primitive that _does_ work reliably,
edge trimming via an overlapping clip, applied carefully
([`arrangement-splitting.ts`](https://github.com/adamjmurray/producer-pal/blob/main/src/tools/shared/arrangement/arrangement-splitting.ts)):

1. **Duplicate the original** off to a "holding area" far past your real
   content, where nothing can collide with it.
2. **Trim each segment** out of copies of that clip by dropping a short
   **temporary clip** at exactly the boundary, letting Live's edge-truncation do
   the cut, then deleting the temp clip.
3. **Move each finished segment** back to its final spot in the arrangement.
4. **Re-scan the track** afterward, because the Live API invalidates clip
   references the moment you start duplicating and deleting.

For a clip split at beats 4 and 8:

```
Original:   |=================|   beats 0-16
            0    4    8      16

Result:     |===|             segment 0  (right-trimmed in place)
                 |===|        segment 1  (duplicated, trimmed both sides, moved)
                      |======| segment 2  (left-trimmed, moved)
```

### The generated silent WAV file

To trim an **audio** clip's edge, Producer Pal needs a temporary audio clip to
drop on the boundary, and Live won't create an audio clip without a real audio
**file** to point at. There's no "empty audio clip."

So Producer Pal generates its own: a tiny
[silent WAV file](https://github.com/adamjmurray/producer-pal/blob/main/src/shared/silent-wav-generator.ts):
0.1 seconds of 44.1 kHz, 16-bit mono silence, about 8.8 KB, written once to a
temp directory and reused. It's built by hand, byte by byte (RIFF header, `fmt`
chunk, and a `data` chunk that's simply all zeros):

```js
const buffer = Buffer.alloc(44 + dataSize);
buffer.write("RIFF", 0);
// ... fmt chunk: PCM, 1 channel, 44100 Hz, 16-bit ...
buffer.write("data", 36);
// remaining bytes are already zero, i.e. silence
```

The temp clip exists for a fraction of a beat before it's deleted, but if
anything ever went wrong and it _did_ play, silence means no sound. Its only job
is to **be present at a position** so Live's edge-trim behavior fires.

The Node.js server generates the file's path when the device loads and threads
it into every tool request as `silenceWavPath`, so the Live API side always
knows where to find it. MIDI clips need none of this: `create_midi_clip` happily
makes an empty clip of any length directly in the arrangement.

## A feature the API doesn't admit to

Every object in the Live API can describe itself: ask a track for its `info` and
it reports its properties and functions. That self-description, plus Ableton's
reference documentation, is the map almost every tool builds from. A track's map
lists `arm`, `mute`, `solo`, its routing, but **not** input monitoring: the **In
/ Auto / Off** switch sitting on every track in Live's mixer. It's absent from
the introspection dump _and_ from the
[official documentation](https://docs.cycling74.com/apiref/lom/track/). By every
signal the API gives you, there is simply no way to set it.

I went looking anyway and started guessing plausible property names.
`current_monitoring_state` turned out to be real: read it and you get back a
number (`0` = In, `1` = Auto, `2` = Off); write it and the track's monitoring
actually changes. It just isn't listed anywhere. That undocumented,
un-introspectable property is now the `monitoringState` control on Producer
Pal's update-track tool.

It's _still_ missing from the docs and the reflection today. I re-probed a
running Live Set while writing this page, and it works exactly as before while
remaining invisible to introspection.

## A language for music, not just API calls

The single largest investment in Producer Pal sits a level _above_ the Live API
entirely: the notation the AI actually composes in.

Asked to write MIDI directly, an LLM has to emit raw note data: pitch numbers
and times in abstract beats, which is error-prone and unmusical. So Producer Pal
gives it purpose-built notations to think in instead:

- **[`bar|beat` notation](/features/midi-notation#bar-beat)**: a text-based
  music notation where time is counted the way musicians count it (`1|1` = bar
  1, beat 1), pitches are names (`C3`, `F#4`), and durations are note values
  (`n/4`, `n/8`), mapped onto exact positions in clips and the arrangement
  across any time signature. It's the default, and it's joined by two
  alternatives, [MIDI JSON](/features/midi-notation#midi-json) for coding agents
  and [Stark](/features/midi-notation#stark) for small models.
- **[Transforms](/features/midi-notation#transforms)**: a small expression
  language for _shaping_ notes and audio with math: LFO shapes, ramps,
  randomized ranges, and per-note or per-clip variation, where a single string
  can broadcast across many clips at once.

These are full domain-specific languages with their own grammars and parsers,
the kind of thing nobody builds for a thin wrapper. See
[MIDI Notation](/features/midi-notation) for the notations, their tradeoffs, and
the transforms language.

---

The Live API is full of cases like this. Producer Pal absorbs them so the model
doesn't have to.

For how the two engines underneath carry this work back and forth, see
[The Bridge](/how-it-works/the-bridge).
