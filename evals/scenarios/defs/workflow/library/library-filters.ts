// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios: does `ppal-library`'s schema get the right filter PICKED?
 *
 * `ppal-library` is the largest tool on the wire, and almost all of that is
 * param prose. Until these existed, no scenario passed `kind`, `type` or a
 * non-search `action` — every one rode the `audio` default — so trimming those
 * descriptions could have cost real efficacy with nothing to show it.
 *
 * They grade the ARGS the model sent, not the results that came back. Results
 * depend on whatever library the machine running Live happens to have; the args
 * are the thing a description change actually moves.
 */

import { getToolCalls } from "../../../assertions/index.ts";
import { resolveSamplesPath } from "../../../run-scenario-helpers.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";

const TOOL_LIBRARY = "ppal-library";
const TOOL_CONNECT = "ppal-connect";
/** The turn carrying the request under test; turn 0 is always connect. */
const ASK_TURN = 1;
/** Every scenario here opens by connecting. */
const MSG_CONNECT = "Connect to Ableton Live";

/** Shared by every scenario here: read-only, and the same tiny sample folder. */
const LIBRARY_SCENARIO = {
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // Reads the library and writes nothing to the Set.
  reuseLiveSet: true,
  config: { sampleFolder: resolveSamplesPath("samples") },
} as const;

/**
 * Every filter set one call carries: the top-level args, plus each `searches[]`
 * entry. A fan-out puts the same filters one level down, and answering with one
 * is at least as good as a plain search — so a check that only read the top
 * level would fail the better answer.
 *
 * @param args - One call's arguments
 * @returns The top-level args followed by any per-query filter sets
 */
function filterSetsOf(
  args: Record<string, unknown>,
): Record<string, unknown>[] {
  const searches = Array.isArray(args.searches)
    ? (args.searches as Record<string, unknown>[])
    : [];

  return [args, ...searches];
}

/**
 * Assert some `ppal-library` call in the ask turn sent the filter under test.
 *
 * A model may search more than once — a broad pass then a narrow one, say — so
 * any call satisfying the predicate counts. What must not happen is every call
 * riding a default.
 *
 * @param description - What the filter is, for the report
 * @param predicate - Reads one filter set; true when the filter was sent
 * @returns A custom assertion over the ask turn
 */
function assertLibraryArgs(
  description: string,
  predicate: (args: Record<string, unknown>) => boolean,
): EvalAssertion {
  return {
    type: "custom",
    description,
    assert: (turns: EvalTurnResult[]) => {
      const calls = getToolCalls(turns, ASK_TURN).filter(
        (call) => call.name === TOOL_LIBRARY,
      );

      if (calls.length === 0) throw new Error(`no ${TOOL_LIBRARY} call`);

      if (!calls.some((call) => filterSetsOf(call.args).some(predicate))) {
        throw new Error(
          `${calls.length} call(s), none matching: ${calls
            .map((call) => JSON.stringify(call.args))
            .join(" | ")
            .slice(0, 240)}`,
        );
      }

      return true;
    },
  };
}

/**
 * `kind` is the one filter with a real trap: audio is the default, and MIDI
 * content is the thing a user is most likely to ask for that the default hides.
 * The description is also the only place saying `midi` covers `.alc` clips as
 * well as `.mid` files, so either kind counts.
 */
export const libraryKindMidi: EvalScenario = {
  ...LIBRARY_SCENARIO,
  id: "library-kind-midi",
  description: "Ask for MIDI content and get kind off its audio default",

  messages: [
    MSG_CONNECT,
    // Says "MIDI" and "not audio" plainly. If the model still rides the audio
    // default, the description isn't carrying the filter.
    "I'm looking for MIDI melody or chord ideas in my library to start a track from — not audio samples. What have I got?",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_LIBRARY, turn: ASK_TURN },
    assertLibraryArgs(
      "searched MIDI content instead of the audio default",
      (args) => args.kind === "midi" || args.kind === "live-clip",
    ),

    { type: "token_usage", maxTokens: 1_500 },
  ],
};

/**
 * `type` carries an instruction, not just an enum: "prefer oneshot for hits and
 * loop for grooves". That sentence is a cut candidate, so something has to
 * notice if removing it stops the filter being sent.
 */
export const libraryTypeOneshot: EvalScenario = {
  ...LIBRARY_SCENARIO,
  id: "library-type-oneshot",
  description: "Ask for a one-shot and get the playback-type filter sent",

  messages: [
    MSG_CONNECT,
    "Find me a punchy kick drum I can trigger as a single hit — I don't want a loop, just the one-shot.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_LIBRARY, turn: ASK_TURN },
    assertLibraryArgs(
      "filtered to one-shots rather than searching by name alone",
      (args) => args.type === "oneshot",
    ),

    { type: "token_usage", maxTokens: 1_500 },
  ],
};

/**
 * `action` is a 161 B enum whose values are otherwise unreachable in the suite.
 * `listTags` is the one small models keep, so it covers both modes.
 */
export const libraryTagDiscovery: EvalScenario = {
  ...LIBRARY_SCENARIO,
  id: "library-tag-discovery",
  description: "Ask what tags exist and get listTags rather than a search",

  messages: [
    MSG_CONNECT,
    "What tags can I filter my library by? Just list what's available — I'm not looking for specific sounds yet.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_LIBRARY, turn: ASK_TURN },
    assertLibraryArgs(
      "enumerated tags instead of running a search",
      (args) => args.action === "listTags",
    ),

    { type: "token_usage", maxTokens: 1_500 },
  ],
};

/**
 * The discovery actions small models never see. One scenario covers the group:
 * what matters is that the enum reads well enough to be reached at all, not
 * which of them a given phrasing picks.
 */
export const libraryDiscoveryActions: EvalScenario = {
  ...LIBRARY_SCENARIO,
  id: "library-discovery-actions",
  description:
    "Reach the browse and duplicate-finding actions, not just search",
  // listCategories and findDuplicates are trimmed from the small-model enum.
  requires: { largeModel: true },

  messages: [
    MSG_CONNECT,
    "Show me how Live organizes its library — the browsing categories it groups sounds under, not a search.",
    "My library feels bloated. Are there samples in there that are byte-for-byte the same audio shipped more than once?",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertLibraryArgs(
      "browsed the category taxonomy",
      (args) => args.action === "listCategories",
    ),
    {
      type: "custom",
      description: "looked for duplicate audio rather than searching by name",
      assert: (turns: EvalTurnResult[]) => {
        const calls = getToolCalls(turns, 2).filter(
          (call) => call.name === TOOL_LIBRARY,
        );

        if (!calls.some((call) => call.args.action === "findDuplicates")) {
          throw new Error(
            `${calls.length} call(s), none using findDuplicates: ${calls
              .map((call) => JSON.stringify(call.args))
              .join(" | ")
              .slice(0, 240)}`,
          );
        }

        return true;
      },
    },

    { type: "token_usage", maxTokens: 2_500 },
  ],
};
