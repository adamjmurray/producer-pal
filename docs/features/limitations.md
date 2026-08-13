---
title: Limitations
description:
  What Producer Pal can't do — no automation or clip envelopes, no control over
  VST/AU plug-in internals, no audio analysis or synthesis, and one Drum Rack
  per track.
---

# Limitations

These are design boundaries, not bugs. They come from what the Live API and Max
for Live expose, so they aren't waiting on a fix. For things that are broken or
surprising, see [Known Issues](/support/known-issues).

## Automation and Envelopes Are Not Supported

Producer Pal cannot read, create, or edit arrangement automation or clip
envelopes — parameter values that change over time. Track and device parameters
like volume, pan, sends, and knobs can be set to static values, but not
automated.

## VST/AU Plug-in Internals Can't Be Controlled Directly

Producer Pal can open or close a plug-in's editor window, but it cannot read or
set the parameters inside a third-party VST/AU plug-in.

To control them, map the parameters onto the Live plug-in device using Live's
[Configure mode](https://www.ableton.com/live-manual/12/working-with-instruments-and-effects/#plug-in-configure-mode)
— expand the device, click "Configure", then click the controls you want in the
plug-in's window. Producer Pal can then set those mapped parameters like any
other device parameter.

You map them yourself — up to 128 parameters, and not every plug-in parameter is
mappable, so pick the ones that matter most.

Live's own instruments and effects have no such limitation, and Producer Pal can
[list your installed plug-ins](/features/tools#ppal-library) (Live 12.4+).

## Audio Content Can't Be Analyzed or Generated

Producer Pal can manage audio clips — set gain, pitch, and warp settings, change
clip length, arrange clips in the Arrangement, and load and manage samples on
Simpler instruments (including Drum Rack pads) — but it cannot listen to,
analyze, or transcribe the audio itself. No detecting notes, key, or tempo from
a waveform; no audio-to-MIDI; no synthesizing audio from scratch.

Not from the device, anyway: the Live API exposes no audio content, and Max for
Live gives it no runtime for DSP or file writing. A coding agent has both, so
the [companion audio skills](/guide/skills#companion-skills) generate and
analyze audio today — and that's the better home for it, since synthesis is
open-ended enough that an agent writing real code beats any DSL Producer Pal
could teach it.

## One Drum Rack Per Track

Drum Racks work in nested structures, but tracks with multiple Drum Racks only
use the first one's drum map. Use one Drum Rack per track for predictable
results.

---

For what Producer Pal _does_ do, see [Features](/features) and the
[Tool Reference](/features/tools).
