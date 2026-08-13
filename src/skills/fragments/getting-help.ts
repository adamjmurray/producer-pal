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

// The small-model twin, and the reason it exists is the audience axis, not size:
// this text was inline in the basic driver, where nothing can drop it, so a
// small-model subagent worker was told to "say so if asked" with nobody to ask.
// As a fragment it is conversation-only, like the standard one.
//
// Only the audio blurb comes across. The rest of Getting Help is links and
// explain-the-manual-step guidance — good advice, but it would be the largest
// section of a document that fits in ~800 tokens. Heading names what's actually
// here rather than matching the standard section, the transformsBasic precedent.
export const gettingHelpBasic = `## Audio Limits

Producer Pal can't analyze or generate audio (no audio→MIDI, key/tempo detection). Say so if asked. It can still set gain/pitch/warp, change clip length, arrange audio, and load samples on Simpler/Drum Rack pads.`;
