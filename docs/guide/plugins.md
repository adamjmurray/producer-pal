---
title: Hosted Plug-ins
description:
  Let Producer Pal read and set every parameter of a VST3, AU or VST2 plug-in by
  loading it inside a Producer Pal wrapper device. What it needs, what works,
  and the limits.
---

# Hosted Plug-ins

Live only lets Producer Pal reach the plug-in parameters you map by hand in
Configure mode (see
[Limitations](/features/limitations#vst-au-plug-in-internals-can-t-be-controlled-directly)).
A **hosted** plug-in has no such limit: Producer Pal loads it inside its own
wrapper device, and the AI can read and set every parameter.

Ask for it when you add a plug-in, like "add Serum 2 to the bass track, hosted,
so you can set all its parameters".

## What You Need

- The [remote script](/guide/remote-script)
- Live 12.4 or later
- The two wrapper devices, **PPal Plug-in Effect** and **PPal Plug-in
  Instrument**. They install with Producer Pal, into your User Library. If one
  is missing, install from the Chat UI's **Settings → Installation**, or ask the
  AI to install Producer Pal. Live's browser can take a few seconds to see them.

## What Works

- **Formats:** VST3, AU and VST2 instruments and effects. When a plug-in is
  installed in several formats, Producer Pal uses VST3, then AU, then VST2.
- **Every parameter**, read and set in the plug-in's own units, by number or by
  the text it shows (`"1/16"`, `"-6 dB"`). A value the plug-in never shows is
  refused, with the values it does show.
- **Automation:** the AI can automate hosted parameters on clips. See
  [Automation](#automation) below.
- **Plug-in window:** the wrapper shows the plug-in's name and an **Open**
  button that opens the plug-in's own window.
- **Saving:** the plug-in's settings save with your Set, and a duplicated track
  or device keeps them.
- **Racks:** a hosted plug-in can go inside a rack chain.
- **Latency:** Live compensates for the plug-in's latency, and follows it when
  the plug-in changes it.

## Limits

- **A plug-in already in your Set can't be converted.** Live's API can't read a
  plug-in's settings, so Producer Pal can only host a plug-in it adds.
- **A plug-in installed while Live is running** can show in Live's browser
  before Live's plug-in database has it. Restart Live to host a new VST3 or VST2
  plug-in.
- **Stereo only.** Live gets the first two outputs of a multi-output instrument,
  and an effect gets no sidechain input.
- **Not supported:** AUv3 plug-ins, VST2 shell plug-ins (such as Waves'
  WaveShell), and AU MIDI effects.
- **Tested on macOS only** so far.
- **Undo** reverts the plug-in's whole previous state at once, not one parameter
  at a time.

## Automation

Ask Producer Pal to automate a hosted parameter by name, like "sweep the cutoff
up across the clip". Live can only automate its own parameters, so the wrapper
has 128 automation slots, and Producer Pal assigns one to each parameter you
automate.

- **Live shows slot names**, like "Automation 002", in the automation chooser,
  lane headers, the clip envelope editor, and on Push. To draw automation by
  hand, check the wrapper's panel: it lists which slot drives which parameter.
- **All 128 slots are always listed** in the automation chooser.
- **Lanes show 0 to 100%**, not the plug-in's units.
- **An edit in the plug-in's window**, or a program change, made while
  automation is moving may not save with the Set until you make another edit
  with automation stopped.

Hosted automation follows the same rules as any other
[clip automation](/guide/automation). The wrapper must be on the clip's own
track.
