// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: does a model trust a write result that says nothing?
 *
 * The observability principle says a write reports only what did NOT land as
 * asked, so a value that went in exactly as written comes back to silence. The
 * worry is that a model won't believe it, and will follow every write with a
 * read, costing more than the echo saved.
 *
 * A `name` write on `ppal-update-track` comes back as a bare `{id, path}`. The
 * scenario passes when the model takes that at its word.
 *
 * Cost isn't asserted: a follow-up read shows in the run's token numbers, and a
 * `token_usage` cap would be a second way to fail for the same reason.
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
/** The Bass track of the basic-midi-4-track Live Set. */
const BASS = 1;

/** The name the scenario writes. */
const NEW_NAME = "Sub Bass";

/** The read-track field this scenario checks. */
interface TrackRead {
  name?: string;
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

      if (wrote < 0) {
        throw new Error(`no ${TOOL_UPDATE_TRACK} call`);
      }

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
 * A `name` write comes back as a bare `{id, path}`: the result mentions neither
 * the name asked for nor the one Live stored. Graded by "no read-back" plus a
 * read proving the write landed (a model that wrote nothing reads nothing and
 * would pass vacuously).
 */
export const writeTrustSilentResult: EvalScenario = {
  id: "write-trust-silent-result",
  tags: ["results"],
  description: "Accept a rename whose result says nothing about the name",
  // Measures a rate rather than pinning behavior: a red run is the finding.
  kind: "capability",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    `Rename the Bass track to ${NEW_NAME}.`,
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: ASK_TURN },
    assertNoReadBack(),

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
