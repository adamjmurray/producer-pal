// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Reach-for probes: does a model lean on a SHORT comma-separated list and
 * expect it to cycle?
 *
 * `color`, create-clip's `path` against `arrangementStart`, and duplicate's
 * `toPath` against it all used to cycle. These probes are what settled folding
 * them into the one rule (ADR-0031): asked to alternate colors, two of three
 * models wrote the short form, and one said outright it did so because the
 * schema advertised cycling. Rewording that line stopped it. The two
 * destination sites were never leaned on at all.
 *
 * They stay as regression guards now — nothing cycles, so a model that writes a
 * short list gets fewer items than it asked for, and these say so before a user
 * finds out. Every prompt says "alternating", the phrasing most likely to
 * invite a short list.
 *
 * Each is its own conversation: a reach-for probe is worthless once an earlier
 * turn has shown the model which form to write.
 *
 * `path-topath-pairing` grades the other half — that a model does not carry the
 * habit into update-clip's `toPath`, where it would destroy a clip.
 */

import { argText } from "../arg-text.ts";
import { clipStarts, asArrangementTrack } from "../arrangement-helpers.ts";
import { getToolCalls } from "../../assertions/index.ts";
import { listEntries } from "../path/path-scenario-helpers.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-scenario-helpers.ts";

const TOOL_CREATE_CLIP = "ppal-create-clip";
const TOOL_UPDATE_CLIP = "ppal-update-clip";
const TOOL_READ_TRACK = "ppal-read-track";
const TOOL_DUPLICATE = "ppal-duplicate";

/** The tools that can carry a per-item list into a clip. */
const WRITE_TOOLS = new Set([
  TOOL_CREATE_CLIP,
  TOOL_UPDATE_CLIP,
  TOOL_DUPLICATE,
]);

/**
 * Whether a "#RRGGBB" reads as red or as blue. Live's palette holds several of
 * each, so an exact value would grade the swatch the model happened to pick.
 * @param color - The color, as "#RRGGBB"
 * @param hue - Which channel has to dominate
 * @returns True when that channel dominates and is bright enough
 */
function reads(color: unknown, hue: "red" | "blue"): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(
    argText(color),
  );

  if (!match) return false;

  const [r, g, b] = match.slice(1).map((hex) => Number.parseInt(hex, 16)) as [
    number,
    number,
    number,
  ];
  const [lead, other] = hue === "red" ? [r, b] : [b, r];

  return lead >= 0x80 && lead > g * 1.5 && lead > other * 1.5;
}

/**
 * No write call named fewer list entries than the positions it wrote to.
 *
 * This is the probe. `shorter` is read off the args the model actually sent, so
 * it says what the model expected the tool to do — not what the tool did with
 * it.
 * @param param - The list param under test
 * @param countedAgainst - The param whose entries say how many positions the call names
 * @returns A custom assertion that fails when the model leaned on cycling
 */
function assertNoShortList(
  param: string,
  countedAgainst: string,
): EvalAssertion {
  return {
    type: "custom",
    description: `every ${param} names one value per position (no cycling)`,
    assert: (turns: EvalTurnResult[]) => {
      for (const { name, args } of getToolCalls(turns)) {
        if (!WRITE_TOOLS.has(name)) continue;

        const values = listEntries(args[param]);
        const positions = listEntries(args[countedAgainst]);

        if (values.length > 0 && values.length < positions.length) {
          throw new Error(
            `${name} sent ${values.length} ${param} for ${positions.length} ` +
              `${countedAgainst} entries — the short form only works because ` +
              `${param} cycles`,
          );
        }
      }

      return true;
    },
  };
}

/**
 * Six session clips down the first track, alternating red and blue.
 * @returns A state assertion over the track's session clips
 */
function assertAlternatingColors(): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_TRACK,
    args: { trackIndex: 0, include: ["session-clips", "color"] },
    expect: (result) => {
      const clips = (result as { sessionClips?: Array<{ color?: unknown }> })
        .sessionClips;

      return (
        clips?.length === 6 &&
        clips.every((clip, i) =>
          reads(clip.color, i % 2 === 0 ? "red" : "blue"),
        )
      );
    },
    explain: (result) => {
      const clips =
        (result as { sessionClips?: Array<{ color?: unknown }> })
          .sessionClips ?? [];

      return `expected 6 clips alternating red and blue, got ${clips.length}: ${clips
        .map((clip) => argText(clip.color, "none"))
        .join(", ")}`;
    },
  };
}

/**
 * One track's arrangement holds clips at exactly these bars.
 * @param trackIndex - The track to read
 * @param bars - The bar|beat positions expected on it
 * @returns A state assertion over the track's arrangement
 */
function assertArrangementBars(
  trackIndex: number,
  bars: string[],
): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_TRACK,
    args: { trackIndex, include: ["arrangement-clips"] },
    expect: (result) =>
      clipStarts(asArrangementTrack(result).arrangementClips).join(",") ===
      bars.join(","),
    explain: (result) =>
      `expected t${trackIndex} clips at ${bars.join(", ")}, got ${
        clipStarts(asArrangementTrack(result).arrangementClips).join(", ") ||
        "none"
      }`,
  };
}

export const colorListPairing: EvalScenario = {
  id: "color-list-pairing",
  description: "Six clips alternating two colors, without relying on cycling",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // No reuseLiveSet: the clips persist, so a second trial would start with the
  // colors already set and could pass without writing anything.

  messages: [
    MSG_CONNECT,
    "Put a one-bar MIDI clip in each of the first six scenes of the Drums " +
      "track, and color them alternating red and blue, starting with red.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
    assertAlternatingColors(),
    assertNoShortList("color", "path"),
    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};

export const arrangementDestinationPairing: EvalScenario = {
  id: "arrangement-destination-pairing",
  description:
    "Clips alternating across two arrangement tracks, without relying on cycling",
  kind: "regression",
  liveSet: "basic-midi-4-track",

  messages: [
    MSG_CONNECT,
    "Add a one-bar MIDI clip to the arrangement at bars 1, 5, 9 and 13, " +
      "alternating between the Drums and Bass tracks — bar 1 on Drums.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
    assertArrangementBars(0, ["1|1", "9|1"]),
    assertArrangementBars(1, ["5|1", "13|1"]),
    assertNoShortList("path", "arrangementStart"),
    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};

export const duplicateDestinationPairing: EvalScenario = {
  id: "duplicate-destination-pairing",
  description:
    "Copies alternating across two arrangement tracks, without relying on cycling",
  kind: "regression",
  liveSet: "basic-with-drum-and-lead-clips",

  messages: [
    MSG_CONNECT,
    "Copy the drum clip into the arrangement at bars 1, 5, 9 and 13, " +
      "alternating between the Drums and Bass tracks — bar 1 on Drums.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertArrangementBars(0, ["1|1", "9|1"]),
    assertArrangementBars(1, ["5|1", "13|1"]),
    assertNoShortList("toPath", "arrangementStart"),
    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};
