// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: Apply swing and quantize to existing MIDI clips.
 */

import { argText } from "../../arg-text.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { getToolCalls } from "../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import { assertNamesTarget } from "../../path/path-assertions.ts";
import { assertNotesRead } from "../helpers/clip-note-assertions.ts";
import { TOOL_READ_CLIP } from "../helpers/clip-tool-constants.ts";
import { readbackNotes } from "../helpers/midi-json-readback.ts";

const TOOL_UPDATE_CLIP = "ppal-update-clip";

/** Closed hats (Ab1) in the Set's drum map. */
const HATS = 44;

/** Hats in the seeded drum clip: 12 eighths, then 8 sixteenths. */
const HAT_COUNT = 20;

/** A 16th note in beats; the clip is 4/4. */
const SIXTEENTH = 0.25;

/** Float tolerance for start times, in beats. */
const EPS = 1e-6;

export const swingAndQuantize: EvalScenario = {
  id: "swing-and-quantize",
  tags: ["transforms"],
  description: "Apply swing and quantize to existing MIDI clips",
  kind: "capability",
  requires: { transforms: true },
  liveSet: "basic-with-drum-and-lead-clips",

  messages: [
    "Connect to Ableton Live",
    "Find the drum clip in the first scene and read the notes",
    "Add swing to the hi-hats in that clip",
    "That's a little too much. Lower the amount of swing",
    "I changed my mind. Quantize the hats to the 16th note grid",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Clip state is read
    assertNotesRead(1),

    // Turn 2: Swing applied to the hats
    swingApplied(2),
    assertNamesTarget({ turn: 2, tool: TOOL_UPDATE_CLIP }),

    // Turn 3: Swing re-applied with lower amount (auto-quantize handles grid alignment)
    swingApplied(3),
    assertNamesTarget({ turn: 3, tool: TOOL_UPDATE_CLIP }),

    // Turn 3: Swing amount is lower than turn 2
    {
      type: "custom",
      description: "swing amount in turn 3 is lower than turn 2",
      assert: (turns) => {
        const turn2Amount = hatSwingAmount(turns, 2);
        const turn3Amount = hatSwingAmount(turns, 3);

        if (turn3Amount >= turn2Amount) {
          throw new Error(
            `swing in turn 3 (${turn3Amount}) should be less than turn 2 (${turn2Amount})`,
          );
        }

        return true;
      },
    },

    // Turn 4: graded by where the hats end up, not by how the transform is
    // spelled (`quant(n/16)`, `round(note.start * 4) / 4`, preTransforms, ...).
    assertNamesTarget({ turn: 4, tool: TOOL_UPDATE_CLIP }),
    hatsQuantizedState(),
    {
      type: "custom",
      description: "quantize used quant() (signal)",
      signal: true,
      assert: (turns) => usedQuant(turns, 4),
    },
  ],
};

/**
 * `swing(amount ...)` on the hats, whichever spelling of the pitch (`Ab1`,
 * `G#1`) or number (`0.2`, `.2`) and whichever param it went in.
 */
const HAT_SWING = /(?:Ab1|G#1)[^:\n]*:\s*timing\s*=\s*swing\(\s*(\d*\.?\d+)/;

/**
 * @param turn - Turn whose hat swing is required
 * @returns Assertion that the turn swung the hats with swing()
 */
function swingApplied(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `turn ${turn} swings the hats with swing()`,
    assert: (turns) => hatSwingAmount(turns, turn) >= 0,
  };
}

/**
 * The amount of the turn's last hat swing(), from `transforms` or
 * `preTransforms`. Throws when the turn has none.
 * @param turns - All turn results
 * @param turn - Turn index to read
 * @returns The swing amount
 */
function hatSwingAmount(turns: EvalTurnResult[], turn: number): number {
  const texts = getToolCalls(turns, turn)
    .filter((c) => c.name === TOOL_UPDATE_CLIP)
    .map(
      (c) => `${argText(c.args.preTransforms)}\n${argText(c.args.transforms)}`,
    );

  for (const text of texts.toReversed()) {
    const match = HAT_SWING.exec(text);

    if (match) {
      return Number.parseFloat(match[1] as string);
    }
  }

  throw new Error(`no hat swing() in turn ${turn}: ${texts.join(" | ")}`);
}

/**
 * The drum clip's end state, read back as midi-json: every hat on the 16th
 * grid and none lost.
 * @returns State assertion over the clip's notes
 */
function hatsQuantizedState(): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_CLIP,
    args: { path: "t0/s0", include: ["notes"] },
    notation: "midi-json",
    expect: (result: unknown): boolean => {
      const notes = readbackNotes(result);

      return notes != null && hatsProblem(notes) == null;
    },
    explain: (result: unknown): string => {
      const notes = readbackNotes(result);

      return notes == null
        ? "clip notes missing or not parseable as midi-json"
        : (hatsProblem(notes) ?? "ok");
    },
  };
}

/**
 * Why the hats are not a clean 16th-grid quantize, if they aren't.
 * @param notes - The clip's notes (start_time in quarter beats)
 * @returns A diagnostic, or null when the hats are right
 */
function hatsProblem(notes: NoteEvent[]): string | null {
  const hats = notes.filter((n) => n.pitch === HATS);

  if (hats.length !== HAT_COUNT) {
    return `expected ${HAT_COUNT} hats, found ${hats.length}`;
  }

  const off = hats.filter((n) => {
    const steps = n.start_time / SIXTEENTH;

    return Math.abs(steps - Math.round(steps)) * SIXTEENTH > EPS;
  });

  return off.length === 0
    ? null
    : `${off.length} hat(s) off the 16th grid: ${off.map((n) => n.start_time).join(", ")}`;
}

/**
 * Whether the turn's update-clip call used `quant(`, in `transforms` or
 * `preTransforms`. Throws when it didn't, which a signal reports.
 * @param turns - All turn results
 * @param turn - Turn index to check
 * @returns True when `quant(` was used
 */
export function usedQuant(turns: EvalTurnResult[], turn: number): boolean {
  const text = getToolCalls(turns, turn)
    .filter((c) => c.name === TOOL_UPDATE_CLIP)
    .map(
      (c) => `${argText(c.args.preTransforms)}\n${argText(c.args.transforms)}`,
    )
    .join("\n");

  if (!text.includes("quant(")) {
    throw new Error(`no quant() in turn ${turn}: ${text.trim() || "(none)"}`);
  }

  return true;
}
