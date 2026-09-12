// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: two opposite randomness requests, and one LFO period.
 *
 * Live stores two different things a user calls "random velocities". One value
 * per note, written into the clip, plays back the same every time. A base plus
 * `velocity_deviation` is a spread Live re-rolls on every playback. `rand()`
 * writes the first, the `vA-B` shorthand writes the second, and both read as
 * "randomize the velocities" — luna picked the spread (or fled to a
 * deterministic wave) in 3 of 3 `drum-transforms` trials on the baked arm.
 *
 * Both arms are graded, and that is the point. An "always use rand()" nudge
 * would pass the first and fail the second, so only a change that teaches the
 * DISTINCTION scores here.
 *
 * GRADED ON THE CLIP, NOT THE ARGUMENT. An earlier draft required the
 * `transforms` param and failed a gemma trial that hand-wrote four different
 * snare velocities — which is the baked outcome, reached another way. Only the
 * end state can tell these two apart without scripting the route.
 *
 * The last turn is a separate question sharing the run: every luna trial wrote
 * `sin(note.start * 3.14159)` before revising to `sin(2bar)`, so the waveform
 * argument reads as radians and costs a round trip. Graded as one call, because
 * the wasted call IS the cost.
 */

import { argText } from "../../arg-text.ts";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type EvalAssertion, type EvalScenario } from "../../../types.ts";
import { interpretMidiJson } from "#src/notation/midi-json/midi-json-notation.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import {
  assertNotesRead,
  getTransforms,
  MSG_CONNECT,
  READ_DRUM_NOTES,
  TOOL_READ_CLIP,
  TOOL_UPDATE_CLIP,
} from "../helpers/clip-scenario-helpers.ts";

/** Snare and hats in the Set's drum map. */
const SNARE = 40;
const HATS = 44;

export const transformRandomBakedOrReplayed: EvalScenario = {
  id: "transform-random-baked-or-replayed",
  description:
    "Tell baked random velocities apart from Live's per-playback spread",
  kind: "capability",
  requires: { transforms: true },
  liveSet: "basic-with-drum-and-lead-clips",

  // Velocity and deviation are the only things this scenario writes, so a
  // transform puts them back — and unlike a `notes` rewrite it does not depend
  // on which notation the server is serving.
  reuseLiveSet: true,
  setup: async (mcpClient: Client) => {
    await mcpClient.callTool({
      name: "ppal-update-clip",
      arguments: { path: "t0/s0", transforms: "velocity = 100\ndeviation = 0" },
    });
  },

  messages: [
    MSG_CONNECT,
    READ_DRUM_NOTES,
    "Slightly randomize the snare velocities, and lock a value into each hit so the clip plays back the same way every time.",
    "Now set the hats up the other way: have them pick a fresh velocity at random on every playback, somewhere around 70 to 110.",
    "Give the kick a velocity LFO that cycles once per bar.",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0 },
    assertNotesRead(1),
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 3 },

    clipStateAssertion(
      "snare velocities vary and are baked in (no per-playback spread)",
      (notes) => {
        const snare = notes.filter((n) => n.pitch === SNARE);

        if (snare.length < 2) {
          return `only ${snare.length} snare note(s)`;
        }

        if (snare.some((n) => (n.velocity_deviation ?? 0) !== 0)) {
          return "snare carries a velocity_deviation — that spread re-rolls on every playback";
        }

        const distinct = new Set(snare.map((n) => n.velocity));

        return distinct.size > 1
          ? null
          : `every snare hit is velocity ${[...distinct][0]} — nothing was randomized`;
      },
    ),

    clipStateAssertion("hats carry a per-playback velocity spread", (notes) => {
      const hats = notes.filter((n) => n.pitch === HATS);

      if (hats.length < 2) {
        return `only ${hats.length} hat note(s)`;
      }

      return hats.every((n) => (n.velocity_deviation ?? 0) > 0)
        ? null
        : "hats have no velocity_deviation — their velocities are fixed, not re-rolled each playback";
    }),

    {
      type: "custom",
      description: "LFO period is a note value, written in one call",
      assert: (turns) => {
        const calls = (turns[4]?.toolCalls ?? []).filter(
          (c) => c.name === TOOL_UPDATE_CLIP,
        );

        if (calls.length === 0) {
          throw new Error(`${TOOL_UPDATE_CLIP} not found in turn 4`);
        }

        // More than one write means the first attempt was revised — the round
        // trip this turn is here to detect.
        if (calls.length > 1) {
          throw new Error(
            `${calls.length} update-clip calls; the period should land first try: ` +
              calls.map((c) => argText(c.args.transforms)).join(" | "),
          );
        }

        const transforms = getTransforms(turns, 4, TOOL_UPDATE_CLIP);
        const wave = /\b(?:sin|cos|tri|saw|square)\(([^,)]*)/.exec(transforms);

        if (!wave) {
          throw new Error(`expected a waveform on velocity: ${transforms}`);
        }

        const period = (wave[1] ?? "").trim();

        // `1bar` is the meter-aware spelling and `n/1` the note value; anything
        // built from note.start or a bare radian constant is the misreading.
        if (!/^(?:\d*bar|n\/\d+)$/.test(period)) {
          throw new Error(
            `waveform period '${period}' is not a note value (expected 1bar or n/1): ${transforms}`,
          );
        }

        return true;
      },
    },

    { type: "token_usage", maxTokens: 6_000 },
  ],
};

/**
 * Grade the drum clip's end state, read back as midi-json so the check never
 * touches the notation the model happened to write in.
 * @param description - Check label
 * @param problem - Returns a diagnostic string, or null when the notes are right
 * @returns State assertion over the clip's notes
 */
function clipStateAssertion(
  description: string,
  problem: (notes: NoteEvent[]) => string | null,
): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_CLIP,
    args: { path: "t0/s0", include: ["notes"] },
    notation: "midi-json",
    expect: (result: unknown): boolean => {
      const notes = notesOf(result);

      return notes != null && problem(notes) == null;
    },
    explain: (result: unknown): string => {
      const notes = notesOf(result);

      return notes == null
        ? `${description}: clip notes missing or not parseable as midi-json`
        : `${description}: ${problem(notes) ?? "ok"}`;
    },
  };
}

/**
 * Parse a read-clip result (read back in midi-json) into notes, or null when the
 * payload is missing or unparseable.
 * @param result - The ppal-read-clip result
 * @returns The clip's notes, or null
 */
function notesOf(result: unknown): NoteEvent[] | null {
  const clip = result as { notes?: unknown };

  if (typeof clip.notes !== "string") {
    return null;
  }

  try {
    return interpretMidiJson(clip.notes);
  } catch {
    return null;
  }
}
