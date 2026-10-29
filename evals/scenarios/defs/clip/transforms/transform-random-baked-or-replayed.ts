// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: two opposite randomness requests, and one LFO period.
 *
 * Live stores two things a user calls "random velocities": one value per note
 * written into the clip (`rand()`), which plays back the same every time, and a
 * base plus `velocity_deviation` (the `vA-B` shorthand), which Live re-rolls on
 * every playback. Both arms are graded, so an "always use rand()" nudge fails
 * the second: only teaching the distinction scores.
 *
 * Graded on the clip, not the argument: hand-written distinct velocities are
 * the baked outcome too.
 *
 * The last turn asks for an LFO period. Models tend to write it as radians
 * (`sin(note.start * 3.14159)`) and then revise, so it is graded as one call:
 * the wasted call is the cost.
 */

import { argText } from "../../arg-text.ts";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type EvalAssertion, type EvalScenario } from "../../../types.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { assertNotesRead } from "../helpers/clip-note-assertions.ts";
import {
  MSG_CONNECT,
  READ_DRUM_NOTES,
  TOOL_UPDATE_CLIP,
} from "../helpers/clip-tool-constants.ts";
import { getTransforms } from "../helpers/clip-turn-readers.ts";
import { assertMidiJsonNotes } from "../helpers/midi-json-readback.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/** Snare and hats in the Set's drum map. */
const SNARE = 40;
const HATS = 44;

// Grades the drum clip's notes; `description` labels a failure.
const drumClipState = (
  description: string,
  problem: (notes: NoteEvent[]) => string | null,
): EvalAssertion => assertMidiJsonNotes("t0/s0", problem, description);

export const transformRandomBakedOrReplayed: EvalScenario = {
  id: "transform-random-baked-or-replayed",
  tags: ["transforms"],
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
      name: TOOLS.updateClip,
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
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },
    assertNotesRead(1),
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 3 },

    drumClipState(
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

    drumClipState("hats carry a per-playback velocity spread", (notes) => {
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
