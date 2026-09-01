// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: the roots and segments outside `t`/`s`.
 *
 * The grammar has nine one-letter conventions — `t`, `s`, `l`, `d`, `p`, `c`,
 * `rc`, `rt`, `mt` — and the clip scenarios only ever exercise the first few.
 * This walks the ones a model meets least: a return track, the main track,
 * and a drum pad.
 *
 * Graded on where the selection LANDED, read off the result's `path`. That is
 * now the only thing in a select result that tells a return track from a
 * regular one — `type` stopped carrying the role, and `trackType` is retired —
 * which is exactly the reliance this scenario has to prove is safe.
 */

import { type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-scenario-helpers.ts";
import { assertCallResult } from "./path-scenario-helpers.ts";

const TOOL_SELECT = "ppal-select";

/**
 * Read the selected track's path off a select result.
 * @param result - Parsed ppal-select result
 * @returns The path ("t0", "rt1", "mt"), or ""
 */
function selectedTrackPath(result: Record<string, unknown>): string {
  const track = result.selectedTrack as { path?: string } | undefined;

  return track?.path ?? "";
}

export const pathUncommonRoots: EvalScenario = {
  id: "path-uncommon-roots",
  description: "Navigate to a return track, the main track, and a drum pad",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // Selection is view state only — nothing to reset between trials.
  reuseLiveSet: true,

  messages: [
    MSG_CONNECT,
    "Show me the A-Delay return track.",
    "Now show me the main track.",
    "Show me the kick pad in the Drums track's drum rack.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    { type: "tool_called", tool: TOOL_SELECT, turn: 1 },
    assertCallResult({
      turn: 1,
      tool: TOOL_SELECT,
      what: "selected a return track",
      check: (result) => /^rt\d+$/.test(selectedTrackPath(result)),
    }),

    { type: "tool_called", tool: TOOL_SELECT, turn: 2 },
    assertCallResult({
      turn: 2,
      tool: TOOL_SELECT,
      what: "selected the main track",
      check: (result) => selectedTrackPath(result) === "mt",
    }),

    { type: "tool_called", tool: TOOL_SELECT, turn: 3 },
    assertCallResult({
      turn: 3,
      tool: TOOL_SELECT,
      what: "selected a pad in the Drums rack",
      check: (result) => {
        const pad = result.selectedDrumPad as { path?: string } | undefined;

        // The rack is nested in an Instrument Rack, so the pad sits several
        // segments deep; any pad path on the Drums track counts.
        return /^t0\/.*\/p[A-G]/.test(pad?.path ?? "");
      },
    }),

    { type: "token_usage", metric: "inputTokens", maxTokens: 90_000 },
  ],
};
