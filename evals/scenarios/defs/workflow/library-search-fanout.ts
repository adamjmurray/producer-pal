// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: does a model reach for `ppal-library`'s `searches` fan-out when a
 * request names several different sounds at once?
 *
 * The fan-out works when called — unit tests and e2e cover that. What nothing
 * measured was whether the schema reads well enough to get PICKED, which was
 * the premise of folding `searchBatch` into `search`. A schema a model never
 * chooses is indistinguishable from one that reads badly.
 */

import { getToolCalls } from "../../assertions/index.ts";
import { resolveSamplesPath } from "../../run-scenario-helpers.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
  type ToolCall,
} from "../../types.ts";

const TOOL_LIBRARY = "ppal-library";

/** The request names three sounds, so a fan-out should carry three queries. */
const SOUNDS_ASKED_FOR = 3;

/** The turn the fan-out belongs to. */
const SEARCH_TURN = 1;

/**
 * A library call's `searches` array, or null when it isn't one.
 *
 * @param call - The tool call to inspect
 * @returns The per-query filter sets, or null
 */
function searchesOf(call: ToolCall): Record<string, unknown>[] | null {
  const searches = call.args.searches;

  return Array.isArray(searches)
    ? (searches as Record<string, unknown>[])
    : null;
}

/**
 * How many of a fan-out's queries filter for something different. Labels are
 * free text and don't count — three queries labeled Kick, Snare and Hat that
 * all filter identically are one search run three times.
 *
 * @param searches - The per-query filter sets
 * @returns The number of distinct filter sets
 */
function distinctFilterCount(searches: Record<string, unknown>[]): number {
  const seen = new Set(
    searches.map(({ label: _label, ...filters }) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(filters).toSorted(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    ),
  );

  return seen.size;
}

/**
 * One library call carried a fan-out covering every sound the request named.
 *
 * @returns A custom assertion over the search turn
 */
function assertFannedOut(): EvalAssertion {
  return {
    type: "custom",
    description: `one ${TOOL_LIBRARY} call fans out to ${SOUNDS_ASKED_FOR} distinct queries`,
    assert: (turns: EvalTurnResult[]) => {
      const calls = getToolCalls(turns, SEARCH_TURN).filter(
        (call) => call.name === TOOL_LIBRARY,
      );

      if (calls.length === 0) throw new Error(`no ${TOOL_LIBRARY} call`);

      const counts = calls
        .map((call) => searchesOf(call))
        .filter((searches) => searches != null)
        .map((searches) => distinctFilterCount(searches));

      if (counts.length === 0) {
        throw new Error(
          `ran ${calls.length} single search(es) instead of one fan-out`,
        );
      }

      const best = Math.max(...counts);

      if (best < SOUNDS_ASKED_FOR) {
        throw new Error(
          `fanned out to only ${best} distinct quer${best === 1 ? "y" : "ies"} for ${SOUNDS_ASKED_FOR} sounds`,
        );
      }

      return true;
    },
  };
}

export const librarySearchFanout: EvalScenario = {
  id: "library-search-fanout",
  description:
    "Reach for ppal-library's searches fan-out when one request names several sounds",
  // Whether a model picks the fan-out is judgment, not instruction.
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // `searches` is hidden in small-model mode, so this is full-mode only.
  requires: { params: ["searches"] },
  // Reads the library and writes nothing to the Set.
  reuseLiveSet: true,

  config: {
    sampleFolder: resolveSamplesPath("samples"),
  },

  messages: [
    "Connect to Ableton Live",
    // Three different sounds, each with its own filter — the case the fan-out
    // exists for. Nothing here hints at the param; that is the point.
    "I'm putting a house kit together. Find me some kicks, some snares and some closed hi-hats from the library — a handful of each, and keep them grouped so I can tell them apart.",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0 },
    { type: "tool_called", tool: TOOL_LIBRARY, turn: SEARCH_TURN },
    assertFannedOut(),

    { type: "response_contains", pattern: /kick/i, turn: SEARCH_TURN },
    { type: "response_contains", pattern: /snare/i, turn: SEARCH_TURN },
    { type: "response_contains", pattern: /hat/i, turn: SEARCH_TURN },

    { type: "token_usage", metric: "inputTokens", maxTokens: 60_000 },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Searched the library for kicks, snares and closed hi-hats
2. Presented the three groups separately rather than as one undifferentiated list
3. Did not invent sample names or paths that no search returned`,
    },
  ],
};
