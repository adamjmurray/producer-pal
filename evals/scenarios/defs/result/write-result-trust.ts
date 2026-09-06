// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios: does a model trust a write result that says nothing?
 *
 * The observability principle says a write reports only what did NOT land as
 * asked — so a value that went in exactly as written comes back to silence.
 * The counter-argument is that a model won't believe it, and will follow every
 * write with a read, costing more than the echo saved.
 *
 * These measure it, as a matched pair on ONE tool. `ppal-update-track` answers
 * a `name` write with a bare `{id, path}` and a `gainDb` write with `{id, path,
 * gainDb}`. Same tool, same track, same schema prose — the only difference the
 * model sees is whether the result mentions the value. If the silent arm draws
 * follow-up reads and the echoing arm doesn't, the echo is load-bearing.
 *
 * Run BOTH arms before the reporting goes conditional. Once it does, the
 * echoing arm can't be measured again.
 *
 * The confound, stated so nobody over-reads the number: the arms differ in the
 * KIND of value too. A string is a string, while a gain is continuous and Live
 * may quantize it — so a model has an honest reason to check a gain that it
 * doesn't have for a name. That pushes reads toward the echoing arm, which is
 * the conservative direction: it can only understate the silent arm's problem.
 *
 * Cost isn't asserted. A follow-up read shows up in the run's own token
 * numbers, and a `token_usage` cap would just be a second way to fail for the
 * reason the read-back check already reports.
 */

import { getToolCalls } from "../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../types.ts";

const TOOL_CONNECT = "ppal-connect";
const TOOL_UPDATE_TRACK = "ppal-update-track";
const TOOL_READ_TRACK = "ppal-read-track";
/** Every read tool shares this prefix. */
const READ_PREFIX = "ppal-read-";

/** The turn carrying the write under test; turn 0 is always connect. */
const ASK_TURN = 1;
/** Both arms write to the same track of the basic-midi-4-track Live Set. */
const BASS = 1;

/** The name the silent arm writes. */
const NEW_NAME = "Sub Bass";
/** The gain the echoing arm writes, in dB. */
const NEW_DB = -6;
/** Live quantizes a dB write, so compare with slack rather than for equality. */
const DB_TOLERANCE = 0.2;

/** Shared by both arms: one write, no question that needs a read to answer. */
const TRUST_SCENARIO = {
  // Measures a rate rather than pinning behavior — a red arm is the finding.
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // Each arm writes to the Set, so neither can reuse the other's.
} as const;

/** The read-track fields these scenarios check. */
interface TrackRead {
  name?: string;
  gainDb?: number;
}

/**
 * Assert nothing was read back after the write, in the same turn.
 *
 * Reads BEFORE the write are fine and expected — that's a model locating the
 * track. What counts is a read after the write landed, since the only thing it
 * can be asking is "did that work?"
 *
 * @returns A custom assertion over the ask turn
 */
function assertNoReadBack(): EvalAssertion {
  return {
    type: "custom",
    description: "took the write result at its word instead of reading back",
    assert: (turns: EvalTurnResult[]) => {
      const calls = getToolCalls(turns, ASK_TURN);
      const wrote = calls.findLastIndex(
        (call) => call.name === TOOL_UPDATE_TRACK,
      );

      if (wrote < 0) throw new Error(`no ${TOOL_UPDATE_TRACK} call`);

      const readBacks = calls
        .slice(wrote + 1)
        .filter((call) => call.name.startsWith(READ_PREFIX));

      if (readBacks.length > 0) {
        throw new Error(
          `${readBacks.length} read(s) after the write: ${readBacks
            .map((call) => `${call.name} ${JSON.stringify(call.args)}`)
            .join(" | ")
            .slice(0, 240)}`,
        );
      }

      return true;
    },
  };
}

/**
 * The silent arm. A `name` write comes back as a bare `{id, path}` — the
 * result mentions neither the name asked for nor the one Live stored.
 */
export const writeTrustSilentResult: EvalScenario = {
  ...TRUST_SCENARIO,
  id: "write-trust-silent-result",
  description: "Accept a rename whose result says nothing about the name",

  messages: [
    "Connect to Ableton Live",
    // One instruction, nothing to report back, nothing to plan.
    `Rename the Bass track to ${NEW_NAME}.`,
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: ASK_TURN },
    assertNoReadBack(),

    // Guards against a vacuous pass: a model that wrote nothing reads nothing.
    {
      type: "state",
      tool: TOOL_READ_TRACK,
      args: { trackIndex: BASS },
      expect: (result) => (result as TrackRead).name === NEW_NAME,
      explain: (result) =>
        `expected the track named ${NEW_NAME}, got ${(result as TrackRead).name ?? "nothing"}`,
    },
  ],
};

/**
 * The echoing arm, and the one that stops being measurable once the reporting
 * goes conditional: a `gainDb` write reports the value read back off the track.
 */
export const writeTrustEchoedResult: EvalScenario = {
  ...TRUST_SCENARIO,
  id: "write-trust-echoed-result",
  description: "Accept a gain change whose result echoes the gain",

  messages: ["Connect to Ableton Live", `Set the Bass track to ${NEW_DB} dB.`],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: ASK_TURN },
    assertNoReadBack(),

    {
      type: "state",
      tool: TOOL_READ_TRACK,
      args: { trackIndex: BASS, include: ["mixer"] },
      expect: (result) =>
        Math.abs(((result as TrackRead).gainDb ?? 0) - NEW_DB) <= DB_TOLERANCE,
      explain: (result) =>
        `expected ${NEW_DB} dB, got ${(result as TrackRead).gainDb ?? 0}`,
    },
  ],
};
