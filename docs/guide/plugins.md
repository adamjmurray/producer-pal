---
title: Full Plug-in Control
description:
  Let Producer Pal read, set and automate every parameter of a VST3, AU or VST2
  plug-in, with no mapping by hand. What it needs, what works, and the limits.
---

# Full Plug-in Control

Live only lets Producer Pal reach the plug-in parameters you map by hand in
Configure mode (see
[Limitations](/features/limitations#vst-au-plug-in-internals-can-t-be-controlled-directly)).
A plug-in added with **full control** has no such limit: the AI can read, set
and automate every parameter, with no mapping.

It works by loading the plug-in inside a wrapper, a custom Max for Live device
that installs with Producer Pal.

Ask for it when you add a plug-in, like "add Serum 2 to the bass track with full
control". The AI also uses it on its own when you ask it to set or automate a
plug-in's parameters.

The trade-off is in automation: only the AI can assign a parameter to an
automation lane, and Live shows the lanes as "Slot 001" and so on instead of the
parameter's name. See [Automation](#automation) below.

## What You Need

- The [remote script](/guide/remote-script)
- Live 12.4 or later
- The two wrapper devices, **PPal Plug-in Effect** and **PPal Plug-in
  Instrument**. They install with Producer Pal, into your User Library. If one
  is missing, install from the Chat UI's **Settings → Installation**, or ask the
  AI to install Producer Pal. Live's browser can take a few seconds to see them.

## What Works

- **Formats:** VST3, AU and VST2 instruments and effects. When a plug-in is
  installed in several formats, Producer Pal uses VST3, then AU, then VST2. Ask
  for a format by name to load that one instead.
- **Every parameter**, read and set in the plug-in's own units, by number or by
  the text it shows (`"1/16"`, `"-6 dB"`). A value the plug-in never shows is
  refused, with the values it does show.
- **Automation:** the AI can automate the plug-in's parameters on clips. See
  [Automation](#automation) below.
- **Plug-in window:** the wrapper has an **Open Plug-in** button that opens the
  plug-in's own window. If you rename the device, the wrapper also shows the
  plug-in's name next to the button.
- **Saving:** the plug-in's settings save with your Set, and a duplicated track
  or device keeps them.
- **Racks:** a plug-in with full control can go inside a rack chain.
- **Latency:** Live compensates for the plug-in's latency, and follows it when
  the plug-in changes it.

## Limits

- **A plug-in already in your Set can't be switched to full control, or back.**
  Live's API can't read or set a normally loaded plug-in's settings, so they
  wouldn't carry over. To switch, save a preset in the plug-in's own window, ask
  the AI to add the plug-in the other way, load the preset in the new one, and
  delete the old one.
- **A plug-in installed while Live is running** can show in Live's browser
  before Live's plug-in database has it. Restart Live to add a new VST3 or VST2
  plug-in with full control.
- **Stereo only.** Live gets the first two outputs of a multi-output instrument,
  and an effect gets no sidechain input.
- **Only what the plug-in exposes.** Producer Pal reaches the parameters a
  plug-in offers to a host. Anything else, including loading the plug-in's
  presets, is only in the plug-in's own window.
- **Not supported:** AUv3 plug-ins, VST2 shell plug-ins (such as Waves'
  WaveShell), and AU MIDI effects.
- **Undo** reverts the plug-in's whole previous state at once, not one parameter
  at a time.
- **Setting a value sweeps the parameter.** To set a value in the plug-in's
  units, Producer Pal moves the parameter through its range for a moment to find
  it, which you may hear if sound is playing through the plug-in.
- **Sharing a Set:** the other person needs Max for Live, the plug-in, and the
  wrapper device. Live's **Collect All and Save** copies the wrappers the Set
  uses into its project folder, as long as its User Library option is on (Live's
  default).

## Automation

Ask Producer Pal to automate a parameter by name, like "sweep the cutoff up
across the clip". Live can only automate its own parameters, so the wrapper has
128 automation slots, and Producer Pal assigns one to each parameter you
automate. You can't assign a slot yourself: ask the AI to automate the
parameter, and then you can edit its lane by hand.

- **Live shows slot names**, like "Slot 002", in the automation chooser, lane
  headers, the clip envelope editor, and on Push. To draw automation by hand,
  check the wrapper's panel: its knobs show the slots 16 at a time (pick a page
  with the tabs), each labeled with the same slot name and the parameter it
  drives.
- **The panel's knobs act like the plug-in's own.** A knob shows the parameter's
  current value, whatever moved it, and turning one changes the parameter and
  its slot. Knobs for unassigned slots are greyed out.
- **All 128 slots are always listed** in the automation chooser.
- **Lanes show 0 to 100%**, not the plug-in's units.
- **Slots don't follow the plug-in's window.** Turning an automated knob there
  moves the panel's knob but not its slot in Live, so Live shows the slot's old
  value until automation, the panel or Producer Pal moves it.
- **While Live plays**, an edit in the plug-in's window to an automated
  parameter, or a program change while automation is moving, may not save with
  the Set until you make another edit with Live stopped.

This automation follows the same rules as any other
[clip automation](/guide/automation). The wrapper must be on the clip's own
track.
