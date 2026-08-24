// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Multi-bar spread — the bar|beat AXIS-stepping failure.
 *
 * When asked for one note/chord per bar across several bars, the model must step
 * the BAR (left of the `|`): `1|1 2|1 3|1 4|1` → Ableton beats 0, 4, 8, 12. The
 * observed failure (seen both with small models and frontier models in the wild)
 * is stepping the BEAT instead: `1|1 1|2 1|3 1|4`, which packs every note into
 * bar 1 (beats 0, 1, 2, 3). The model often DESCRIBES the spread correctly while
 * emitting the wrong axis — so a count alone can't catch it. Only the note
 * POSITIONS distinguish a real per-bar spread from a bunched-into-bar-1 collapse.
 *
 * Like the other notation scenarios, this grades the OUTCOME (positions read
 * back from Live), not the path: the model may hand-enumerate positions or set
 * a length and step — either is fine as long as the notes land on the bar
 * downbeats. The deterministic read-back assertions are the whole grade — no
 * LLM judge, which would only miscount bar|beat notation.
 */

import { type NoteEvent } from "#src/notation/types.ts";
import { type EvalScenario } from "../../../../types.ts";
import { clipStateAssertion } from "../../helpers/clip-scenario-helpers.ts";
import {
  createClipScenario,
  LEAD_SLOT_1,
  LEAD_SLOT_2,
} from "../../helpers/clip-scenario-builders.ts";

/** Float tolerance for note start_time comparisons (in beats). */
const EPS = 1e-6;
/** Downbeats of bars 1-4 in 4/4, in Ableton quarter beats (the per-bar grid). */
const BAR_DOWNBEATS = [0, 4, 8, 12];
/** C3 / C major triad pitches (C3=60, E3=64, G3=67). */
const C3 = 60;
const C_MAJOR = [60, 64, 67];

/**
 * Four chords, one per bar — the read-back wants twelve notes forming a C major
 * triad on each bar downbeat (Ableton beats 0, 4, 8, 12).
 *
 * @param events - Notes read back and re-interpreted in 4/4
 * @returns True when each bar downbeat carries the full triad
 */
function chordPerBar(events: NoteEvent[]): boolean {
  if (events.length !== BAR_DOWNBEATS.length * C_MAJOR.length) return false;

  return BAR_DOWNBEATS.every((downbeat) => {
    const pitches = events
      .filter((e) => Math.abs(e.start_time - downbeat) < EPS)
      .map((e) => e.pitch)
      .toSorted((a, b) => a - b);

    return (
      pitches.length === C_MAJOR.length &&
      C_MAJOR.every((p, i) => pitches[i] === p)
    );
  });
}

/**
 * Four single notes, one per bar — exactly four C3 notes on the bar downbeats.
 * The cleanest discriminator of the axis bug: the beat-stepping failure
 * (`1|1 1|2 1|3 1|4`) bunches all four into bar 1 at beats 0, 1, 2, 3.
 *
 * @param events - Notes read back and re-interpreted in 4/4
 * @returns True when the four notes land on the four bar downbeats
 */
function notePerBar(events: NoteEvent[]): boolean {
  if (events.length !== BAR_DOWNBEATS.length) return false;

  const sorted = events.toSorted((a, b) => a.start_time - b.start_time);

  return sorted.every(
    (e, i) =>
      e.pitch === C3 &&
      Math.abs(e.start_time - (BAR_DOWNBEATS[i] as number)) < EPS,
  );
}

/**
 * One scenario, two spreads. The CHORD case runs first because it is the
 * failure seen in the wild — the model described four chords "across bars 1-4"
 * and emitted `1|1 1|2 1|3 1|4` — and a successful single-note spread just
 * before it would give the answer away. The single-note case follows as the
 * cleaner discriminator.
 */
export const barBeatPerBarSpread: EvalScenario = createClipScenario({
  id: "bar-beat-per-bar-spread",
  description:
    "One chord, then one note, on each bar's downbeat across 4 bars — bar-axis stepping (not beat)",
  messages: [
    "On the Lead track, create a 4-bar MIDI clip in scene 1: a C major chord (C3, E3, G3) on the downbeat of each bar — one chord per bar, spread across bars 1, 2, 3, and 4 (four chords).",
    "Now, on the Lead track, create a 4-bar MIDI clip in scene 2: a single C3 note on the downbeat (beat 1) of each bar — four notes total, one on bar 1, one on bar 2, one on bar 3, one on bar 4.",
  ],
  clearSlots: [LEAD_SLOT_1, LEAD_SLOT_2],
  assertions: [
    clipStateAssertion(LEAD_SLOT_1, "4/4", chordPerBar),
    { type: "tool_called", tool: "ppal-create-clip", turn: 2 },
    clipStateAssertion(LEAD_SLOT_2, "4/4", notePerBar),
    { type: "token_usage", metric: "inputTokens", maxTokens: 160_000 },
  ],
});
