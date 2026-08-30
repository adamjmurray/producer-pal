---
title: Limitations
description:
  What Producer Pal can't do, and the workarounds. No control over VST/AU
  plug-in internals, no editing clip envelopes or automation, no audio analysis
  or synthesis, and one drum pitch map per track.
---

# Limitations

These are design boundaries, not bugs. They come from what the Live API and Max
for Live expose, so they aren't waiting on a fix. For things that are broken or
surprising, see [Known Issues](/support/known-issues).

## VST/AU Plug-in Internals Can't Be Controlled Directly

Producer Pal can open or close a plug-in's editor window, and
[list the plug-ins you have installed](/features/tools#ppal-library) (Live
12.4+), but it cannot read or set the parameters inside a third-party VST/AU
plug-in.

::: tip Workaround: map the parameters you need

Map them onto the Live plug-in device with Live's
[Configure mode](https://www.ableton.com/live-manual/12/working-with-instruments-and-effects/#plug-in-configure-mode)
by expanding the device, clicking **Configure**, then clicking the controls you
want in the plug-in's window. Producer Pal can then set those mapped parameters
like any other device parameter.

You map them yourself, up to 128 parameters, and not every plug-in parameter is
mappable, so pick the ones that matter most.

**Save the mappings in a rack, not a plug-in preset.** Saving a preset for the
plug-in device on its own loses the mappings (still true as of Live 12.4). Wrap
the plug-in in a rack and save a rack preset instead. A rack preset keeps the
mappings of every plug-in inside it.

:::

::: tip Workaround: use Live's own devices

Live's instruments and effects expose every parameter, so anything built from
them works fully: no mapping step, nothing to keep in sync.

:::

## Clip Envelopes and Automation Can't Be Edited

Producer Pal cannot read, create, or edit **clip envelopes**, the curves drawn
inside a clip for pitch bend, MIDI CC, or a device or mixer parameter. Track and
device parameters like volume, pan, sends, and knobs can be set to static
values, but not shaped over time. The same goes for **arrangement automation**,
the curves drawn on the track's timeline rather than inside a clip.

Envelopes you already have are safe, though. They live in the clip, so they
travel with it through the edits Producer Pal does make. The one exception is
take lanes: duplicating a clip onto or off a lane re-creates it (from its notes
for MIDI, from its sample for audio) and leaves the envelopes behind. Producer
Pal warns when that happens.

## Audio Content Can't Be Analyzed or Generated

Producer Pal can manage audio clips (set gain, pitch, and warp settings, change
clip length, arrange clips in the Arrangement, and load and manage samples on
Simpler instruments, Drum Rack pads included), but it cannot listen to, analyze,
or transcribe the audio itself. No detecting notes, key, or tempo from a
waveform; no audio-to-MIDI; no synthesizing audio from scratch.

::: tip Workaround: drive it from a coding agent

A coding agent runs outside Live, with a real runtime and a filesystem, so the
[companion audio skills](/guide/skills#companion-skills) cover the whole round
trip today: synthesize audio from scratch, render a MIDI track or the entire mix
to a file (macOS only), and analyze what comes back. That's the better home for
it: synthesis is open-ended enough that an agent writing real code beats any DSL
Producer Pal could teach it.

:::

## Looped Arrangement Clips Can't Be Lengthened in Place

An unlooped arrangement clip, MIDI or audio, is extended by moving its end. A
looped one has no equivalent move. What plays is the loop region, so covering
more of the timeline takes more clips.

::: tip Workaround: Producer Pal tiles them for you

Ask for a longer looped arrangement clip and Producer Pal duplicates and tiles
it to fill the length. It sounds identical, but the result is a row of clips
rather than one long one: a 2-bar clip stretched to 32 bars lands as 16 clips,
and nothing in the API merges them back into a loop.

That's the default because each tile is a real copy, clip envelopes included.

:::

::: tip Workaround: ask for one long clip instead (MIDI only)

If you'd rather have a single clip, say so. Producer Pal turns looping off,
extends the clip, and writes the pattern out across the whole span.
[Bar copying](/features/midi-notation#bar-beat) does that in one call however
many repeats you need.

The repeats are then real notes, not a loop, so changing the pattern later means
changing every repeat. It stays the same clip, so its envelopes stay with it.
Audio clips have no equivalent, since there are no notes to write.

:::

## One Drum Rack Pitch Map Per Track

Reading a track gives the AI a map of which MIDI pitch triggers which drum pad,
so it can place your kick and snare by name instead of guessing. That map comes
from the first Drum Rack on the track, including ones nested inside other racks,
so if you layer several, the AI goes by the first one's pad names.

---

For what Producer Pal _does_ do, see [Features](/features) and the
[Tool Reference](/features/tools).
