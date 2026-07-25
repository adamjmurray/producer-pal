// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Session-vs-Arrangement habits, playback, and general music-making advice —
// the "how to work in Live" fragment. Gated by playback plus conversation: a
// worker handed one clip to write doesn't decide when to start playback or how
// to keep harmonic rhythm in sync.
//
// This text used to leak bar|beat syntax (`n` durations and `1|1xN` repeats),
// which stark and midi-json users don't have. Nothing here may name a notation's
// syntax — the notation head owns that, and this fragment ships to all five.
export const workingWithLive = `## Working with Ableton Live

**Views and Playback:**
- Session View: Jam, try ideas, build scenes
  - Use auto:"play-scene" when generating clips; warn user about clip restarts
- Arrangement View: Structure songs on a timeline
  - Session clips override Arrangement; use "play-arrangement" for arrangement playback

**Creating Music:**
- For drum tracks, read the track with \`drum-map\` include for correct pitches (don't assume General MIDI); give each drum an explicit duration and space repeated hits by that duration rather than by hand-listed grid beats — outside x/4 meters a grid beat is not a note value (see Time & Note Values)
- Use velocity dynamics (pp=40, p=60, mf=80, f=100, ff=120) for expression
- Keep harmonic rhythm in sync across tracks

**Layering:** To layer tracks on one instrument, duplicate with routeToSource=true. New track controls the same instrument.

**Locators:** Use ppal-update-live-set to create/rename/delete locators at bar|beat positions. Use locator names with ppal-playback to start or loop from named positions.`;
