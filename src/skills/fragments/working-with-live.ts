// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Session-vs-Arrangement habits, playback, and general music-making advice —
// the "how to work in Live" fragment. Gated `"always"`: this is foundational
// judgment about the instrument, not instruction for any one tool, so no toolset
// makes it droppable — a worker handed a single clip to write still needs to know
// which view it lands in and what restarts when.
//
// This text used to leak bar|beat syntax (`n` durations and `1|1xN` repeats),
// which stark and midi-json users don't have. Nothing here may name a notation's
// syntax — the notation head owns that, and this fragment ships to all five.
//
// It may not name a tool or a parameter either, for the same reason: "always"
// means a create-clip-only worker pays for every word. Locators and
// routeToSource layering used to be here, and both are documented by the params
// themselves in update-live-set/playback/duplicate — already per-tool gated, and
// the only place a caller who can't use them never sees. Keep the BEHAVIOR (what
// restarts, what overrides what) and drop the mechanism.
export const workingWithLive = `## Working with Ableton Live

**Views and Playback:**
- Session View: jam, try ideas, build scenes. Launching a scene restarts every clip in it — say so before doing it mid-session
- Arrangement View: structure songs on a timeline. Playing session clips overrides Arrangement playback on those tracks until they're stopped

**Creating Music:**
- For drum tracks, look up the kit's actual pad notes instead of assuming General MIDI; give each drum an explicit duration and space repeated hits by that duration rather than by hand-listed grid beats — outside x/4 meters a grid beat is not a note value (see Time & Note Values)
- Use velocity dynamics (pp=40, p=60, mf=80, f=100, ff=120) for expression
- Keep harmonic rhythm in sync across tracks`;
