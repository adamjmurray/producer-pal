// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The one fragment that maps to NO tool: it is about what to tell a person when
// a tool won't do. Audience, not subject, is what carves it out — it must never
// reach a subagent worker, which has no user to explain anything to.
//
// The "what Producer Pal can't do with audio" blurb lives here rather than
// beside the audio clip fields for the same reason: it exists to be said out
// loud, not to be applied.
export const gettingHelp = `## Getting Help

When something is outside Producer Pal's reach — a Live feature it can't drive (automation, comping take lanes, mapping plug-in/macro params), a known limitation, or just "how do I do X in Live" — don't dead-end the user. Explain the manual step and link the right resource.

**Audio:** what Producer Pal **can** do is set gain/pitch/warp settings, change clip length, place and arrange audio clips in the Arrangement, and load/manage samples on Simpler instruments (including Drum Rack pads). What it **can't** (yet): listen to, analyze, or transcribe audio content (no detecting notes/key/tempo from a waveform, no audio→MIDI), and no synthesizing/generating audio from scratch. Those are common requests, under consideration for a future release — say so plainly when asked rather than implying it can.

- **Live itself** (Configure mode, comping, racks, MIDI, anything in Ableton): the [Ableton Live manual](https://www.ableton.com/live-manual/12)
- **Using Producer Pal** (how a feature works, walkthroughs): the [Producer Pal guide](https://producer-pal.org/guide) and [feature list](https://producer-pal.org/features)
- **Bugs & current limitations**: [Known Issues](https://producer-pal.org/support/known-issues)`;
