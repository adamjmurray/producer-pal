---
title: Limitations
description:
  What Producer Pal can't do, and the workarounds — no control over VST/AU
  plug-in internals, no automation or clip envelopes, no audio analysis or
  synthesis, and one Drum Rack per track.
---

# Limitations

These are design boundaries, not bugs. They come from what the Live API and Max
for Live expose, so they aren't waiting on a fix. For things that are broken or
surprising, see [Known Issues](/support/known-issues).

## VST/AU Plug-in Internals Can't Be Controlled Directly

Producer Pal can open or close a plug-in's editor window, but it cannot read or
set the parameters inside a third-party VST/AU plug-in.

::: tip Workaround: map the parameters you need

Map them onto the Live plug-in device with Live's
[Configure mode](https://www.ableton.com/live-manual/12/working-with-instruments-and-effects/#plug-in-configure-mode)
— expand the device, click **Configure**, then click the controls you want in
the plug-in's window. Producer Pal can then set those mapped parameters like any
other device parameter.

You map them yourself — up to 128 parameters, and not every plug-in parameter is
mappable, so pick the ones that matter most.

**Save the mappings in a rack, not a plug-in preset.** Saving a preset for the
plug-in device on its own loses the mappings (still true as of Live 12.4). Wrap
the plug-in in a rack and save a rack preset instead — a rack preset keeps the
mappings of every plug-in inside it.

:::

::: tip Workaround: use Live's own devices

Live's instruments and effects expose every parameter, so anything built from
them works fully. Producer Pal can also
[list your installed plug-ins](/features/tools#ppal-library) (Live 12.4+) when
you want to see what's available.

:::

## Automation and Envelopes Are Not Supported

Producer Pal cannot read, create, or edit arrangement automation or clip
envelopes — parameter values that change over time. Track and device parameters
like volume, pan, sends, and knobs can be set to static values, but not
automated.

## Audio Content Can't Be Analyzed or Generated

Producer Pal can manage audio clips — set gain, pitch, and warp settings, change
clip length, arrange clips in the Arrangement, and load and manage samples on
Simpler instruments (including Drum Rack pads) — but it cannot listen to,
analyze, or transcribe the audio itself. No detecting notes, key, or tempo from
a waveform; no audio-to-MIDI; no synthesizing audio from scratch.

Not from the device, anyway: the Live API exposes no audio content, and Max for
Live gives it no runtime for DSP or file writing.

::: tip Workaround: drive it from a coding agent

An agent has both, so the
[companion audio skills](/guide/skills#companion-skills) generate and analyze
audio today. That's the better home for it: synthesis is open-ended enough that
an agent writing real code beats any DSL Producer Pal could teach it.

:::

## One Drum Rack Per Track

Producer Pal tells the AI which MIDI pitch triggers which drum pad, so it can
put your kick on C1 and your snare on D1 by name instead of guessing. It reads
that mapping from a single Drum Rack — the first one on the track, including
ones nested inside other racks. Pads in a second Drum Rack on the same track
stay invisible to the AI.

::: tip Workaround: keep it to one rack per track

Put every drum sound in one Drum Rack — it holds 128 pads, so a second rack is
rarely what you need. If you want a separate kit, give it its own track.

:::

---

For what Producer Pal _does_ do, see [Features](/features) and the
[Tool Reference](/features/tools).
