---
title: Clip Automation
description:
  Ask Producer Pal to read and write automation on your clips - volume, pan,
  sends and device parameters - in Session and Arrangement. What it can do, what
  it can't, and how to ask for it.
---

# Clip Automation

Producer Pal can read and write automation on your clips: mixer **volume**,
**pan** and **sends**, and **device parameters**. Ask for it in plain words,
like "fade the pad in over the first four bars".

It needs the [remote script](/guide/remote-script). Writing automation also
needs Live 12.4 or later. On Live 12.3, reading and clearing still work.

## Session Clips

A session clip holds its own automation (clip envelopes). Producer Pal can read
it, write it, and clear it, and it travels with the clip when you duplicate it.

## Arrangement Clips

You can write automation on arrangement clips too. In the Arrangement,
automation belongs to the _track_, not the clip, so Producer Pal writes the
track's automation lane over exactly the span of the clip. A few things follow:

- **It can't read it back or clear it.** Live's API doesn't show a track's
  arrangement automation. To change it, write it again: that overwrites the lane
  over the clip's span. After the clip ends, the lane returns to its old value.
- **The automation stays on the track.** If you move the clip, the automation
  stays where it was. Automate the arrangement last, once the clips stop moving.
- **The clip gets a new ID.** The clip itself (notes, audio, settings) is kept.

Copying an automated session clip into the Arrangement also writes its
automation onto the track.

More detail:
[Arrangement Automation Replaces the Lane Over the Clip](/features/limitations#arrangement-automation-replaces-the-lane-over-the-clip)
and
[Some Moves Drop Clip Envelopes](/features/limitations#some-moves-drop-clip-envelopes).

## Try Asking

- "Read the automation on the clip in track 2, scene 1."
- "Fade the volume of the pad clip in over the first four bars."
- "Make the bass clip's filter cutoff sweep up across all eight bars."
- "Pan the hi-hat clip slowly from left to right."
- "Add a send 1 swell on the last bar of the vocal clip."
- "Clear the volume automation on that session clip."

## How It's Written

For the curious: the AI writes each automation line as a parameter plus a list
of points, using the same `bar|beat` positions as notes. Points are joined by:

| Joiner | Meaning                                                                                   |
| ------ | ----------------------------------------------------------------------------------------- |
| `/`    | straight ramp to the next point                                                           |
| `_`    | hold the value, then jump at the next point                                               |
| `~N`   | curved ramp, `N` from -1 to 1: above the straight line when positive, below when negative |

For example, `1|1 0 / 3|1 0.8 _ 4|1 0.2 ~0.5 5|1 1` ramps from 0 to 0.8 over two
bars, holds it until bar 4, jumps to 0.2, then curves up to 1 at bar 5.

- **Values are raw**, usually 0 to 1, not the units Live shows (a filter in Hz,
  a percentage). Mixer volume 0.85 is 0 dB. Pan runs from -1 (hard left) to 1
  (hard right).
- **Each line replaces that parameter's whole envelope.** On a session clip, an
  empty line clears it.
- **On an arrangement clip**, bar 1 is where the clip starts. The points run
  once across the clip, however it loops.
- **Session audio clips must be warped.** An unwarped audio clip can't play
  envelopes, so writing one is refused until warping is on.

The tool settings are `include: ["envelopes"]` on
[Read Clip](/features/tools#ppal-read-clip) and `envelopes` on
[Update Clip](/features/tools#ppal-update-clip). Reading envelopes works on
session clips only.
