// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Probes for the multi-target list params on the track tools.
 *
 * `track-list-batching` guards that a model names several tracks in ONE call,
 * for a write and then for a read, rather than looping one call per track.
 * It also checks that a color which snaps to Live's palette is not reported as
 * a failure.
 *
 * `track-name-comma-pairing` writes names that contain a comma. List params
 * split on commas, so a literal one is written as `\,`. A model that sends a
 * mismatched list is refused with a hint, and recovering from it is a pass:
 * only the final names are graded.
 */

import { argText } from "../arg-text.ts";
import { getToolCalls } from "../../assertions/index.ts";
import { listEntries } from "../path/path-assertions.ts";
import { trackNames } from "../helpers/track-names.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
  type ToolCall,
} from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-tool-constants.ts";

const TOOL_UPDATE_TRACK = "ppal-update-track";
const TOOL_READ_TRACK = "ppal-read-track";
const TOOL_READ_LIVE_SET = "ppal-read-live-set";

/** The turn carrying the first request; turn 0 is always connect. */
const WRITE_TURN = 1;
const COMPARE_TURN = 2;

/** The first four tracks of basic-midi-4-track, as paths. */
const FIRST_FOUR = ["t0", "t1", "t2", "t3"];
const NEW_NAMES = ["Drums", "Bass", "Keys", "Pad"];

/**
 * The targets a call names, from `path` or else `id`.
 * @param call - The tool call
 * @returns The listed entries, empty when it names none
 */
function targetsOf(call: ToolCall): string[] {
  const paths = listEntries(call.args.path);

  return paths.length > 0 ? paths : listEntries(call.args.id);
}

/**
 * The rename and recolor went out as ONE update-track call that names all four
 * tracks and carries a name and a color for each.
 * @returns A custom assertion over the write turn
 */
function assertOneBatchedWrite(): EvalAssertion {
  return {
    type: "custom",
    description: "renamed and colored all four tracks in one update-track call",
    assert: (turns: EvalTurnResult[]) => {
      const writes = getToolCalls(turns, WRITE_TURN).filter(
        (call) => call.name === TOOL_UPDATE_TRACK,
      );

      if (writes.length !== 1) {
        throw new Error(`expected 1 update-track call, got ${writes.length}`);
      }

      const [call] = writes as [ToolCall];
      const targets = targetsOf(call).length;
      const names = listEntries(call.args.name).length;
      const colors = listEntries(call.args.color).length;

      if (targets !== 4 || names !== 4 || colors !== 4) {
        throw new Error(
          `expected 4 targets, names and colors; got ${targets}, ${names}, ${colors} ` +
            `(${JSON.stringify(call.args).slice(0, 200)})`,
        );
      }

      return true;
    },
  };
}

/**
 * The compare turn read all four tracks with ONE read-track call, not one call
 * per track. Other read tools, and a follow-up read, are fine.
 * @returns A custom assertion over the compare turn
 */
function assertOneBatchedRead(): EvalAssertion {
  return {
    type: "custom",
    description: "read all four tracks with one read-track call",
    assert: (turns: EvalTurnResult[]) => {
      const reads = getToolCalls(turns, COMPARE_TURN).filter(
        (call) => call.name === TOOL_READ_TRACK,
      );
      const coversAll = reads.some((call) => {
        const paths = listEntries(call.args.path);

        return paths.length > 0
          ? FIRST_FOUR.every((path) => paths.includes(path))
          : listEntries(call.args.id).length >= 4;
      });

      if (!coversAll || reads.length > 2) {
        throw new Error(
          `${reads.length} read-track call(s), none-or-too-many naming all four: ` +
            reads
              .map((call) => argText(call.args.path ?? call.args.id))
              .join(" | "),
        );
      }

      return true;
    },
  };
}

/** A track entry of a read-track list read. */
interface ColorRead {
  color?: unknown;
}

/**
 * The colors in a list read, in track order.
 * @param result - The parsed read-track result
 * @returns One color per entry, empty when the result is not a list
 */
function colorsOf(result: unknown): string[] {
  return Array.isArray(result)
    ? (result as ColorRead[]).map((track) => argText(track.color, "none"))
    : [];
}

/**
 * The first four tracks carry four different colors.
 * @returns A state assertion over a list read of t0-t3
 */
function assertDistinctColors(): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_TRACK,
    args: { path: FIRST_FOUR.join(","), include: ["color"] },
    expect: (result) => {
      const colors = colorsOf(result);

      return colors.length === 4 && new Set(colors).size === 4;
    },
    explain: (result) =>
      `expected 4 distinct colors, got ${colorsOf(result).join(", ") || "no list"}`,
  };
}

/**
 * The Set's tracks carry exactly these names, in order.
 * @param expected - Names of tracks t0 onward
 * @returns A state assertion over the Set's track list
 */
function assertTrackNames(expected: string[]): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_LIVE_SET,
    args: { include: ["tracks"] },
    expect: (result) =>
      trackNames(result).slice(0, expected.length).join("|") ===
      expected.join("|"),
    explain: (result) =>
      `expected tracks ${JSON.stringify(expected)}, got ${JSON.stringify(trackNames(result))}`,
  };
}

export const trackListBatching: EvalScenario = {
  id: "track-list-batching",
  tags: ["pairing"],
  description: "Rename, color and then read four tracks with one call each",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // The checks below pin the outcome. The judge only looks at how the reply
  // treats a color that landed on a nearby palette swatch.
  judgeAdvisory: true,

  messages: [
    MSG_CONNECT,
    "Rename tracks 1–4 to Drums, Bass, Keys, Pad and give each a different color.",
    "Compare the mixer settings and devices on all four tracks.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertOneBatchedWrite(),
    assertTrackNames(NEW_NAMES),
    assertDistinctColors(),
    assertOneBatchedRead(),

    {
      type: "llm_judge",
      prompt: `Evaluate the assistant's replies:
1. After the rename and color request it reports the four tracks as renamed and
   colored. Live snaps colors to its palette, and a tool result may say a color
   "landed as #XXXXXX". That is normal. The assistant must NOT present it as a
   failure or error. Mentioning it neutrally is fine.
2. After the compare request it covers mixer settings and devices for each of
   the four tracks.`,
    },
  ],
};

export const trackNameCommaPairing: EvalScenario = {
  id: "track-name-comma-pairing",
  tags: ["pairing"],
  description: "Rename two tracks to names that contain a comma",
  kind: "regression",
  liveSet: "basic-midi-4-track",

  messages: [
    MSG_CONNECT,
    "Rename the Chords track to 'Keys, Wet' and the Lead track to 'Pad, Dry'.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: WRITE_TURN },
    // Final names only, and no other track renamed. How the model got there
    // is not graded: recovering from a refused list is a pass.
    assertTrackNames(["Drums", "Bass", "Keys, Wet", "Pad, Dry", "5-MIDI"]),
  ],
};
