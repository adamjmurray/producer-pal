// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Which of a rack's macros are mapped. Max's Live API only says whether the rack
// has any mapping; the Producer Pal remote script can say which.

import { errorMessage } from "#src/shared/error-message.ts";
import {
  MAX_RACKS_PER_CALL,
  RACK_MACROS_ROUTE,
  type RackMacrosResult,
} from "#src/tools/shared/remote-script/rack-macros-contract.ts";
import { remoteScriptRoute } from "#src/tools/shared/remote-script/remote-script-route.ts";

/** What the remote script said about one rack's macros. */
export type MappedMacros =
  /** The mapped macros' numbers, 1-based, hidden ones included */
  | { mapped: number[] }
  /** Why they couldn't be read: the remote script said so, or didn't answer */
  | { unreadable: string };

const REMOTE_SCRIPT_MISSING = "the Producer Pal remote script isn't running";

/**
 * Ask the remote script which macros are mapped on each rack, a chunk of racks
 * at a time. Never throws: a rack it can't answer for carries the reason.
 * @param racks - The racks to ask about
 * @param deadline - The request deadline from ToolContext, if any
 * @param maxWaitMs - A shorter wait than the usual one for each call, for a
 *   caller that can do without the answer
 * @returns One answer per rack, in order; null when the remote script isn't
 *   running, so there is nothing to ask
 */
export async function lookUpMappedMacros(
  racks: LiveAPI[],
  deadline: number | null | undefined,
  maxWaitMs?: number,
): Promise<MappedMacros[] | null> {
  const answers: MappedMacros[] = [];
  let stalled: string | undefined;

  for (let at = 0; at < racks.length; at += MAX_RACKS_PER_CALL) {
    const chunk = racks.slice(at, at + MAX_RACKS_PER_CALL);

    // A route that stalled once would stall the rest the same way.
    if (stalled != null) {
      const unreadable: MappedMacros = { unreadable: stalled };

      answers.push(...chunk.map(() => unreadable));
      continue;
    }

    const asked = await askAbout(chunk, deadline, maxWaitMs);

    if (asked == null) {
      return null;
    }

    stalled = asked.stalled;
    answers.push(...asked.answers);
  }

  return answers;
}

// --- Helpers below main exports ---

/**
 * One remote-script call for a chunk of racks.
 * @param racks - At most MAX_RACKS_PER_CALL racks
 * @param deadline - The request deadline from ToolContext, if any
 * @param maxWaitMs - A shorter wait than the usual one, if any
 * @returns One answer per rack, and why the route stalled if it did; null when
 *   the remote script isn't running
 */
async function askAbout(
  racks: LiveAPI[],
  deadline: number | null | undefined,
  maxWaitMs: number | undefined,
): Promise<{ answers: MappedMacros[]; stalled?: string } | null> {
  try {
    const outcome = await remoteScriptRoute<RackMacrosResult>(
      RACK_MACROS_ROUTE,
      { devicePaths: racks.map((rack) => rack.path) },
      deadline,
      REMOTE_SCRIPT_MISSING,
      maxWaitMs,
    );

    if (!outcome.ok) {
      if (!outcome.available) {
        return null;
      }

      return {
        answers: racks.map(() => ({ unreadable: outcome.reason })),
        ...(outcome.stalled != null && { stalled: outcome.reason }),
      };
    }

    return {
      answers: racks.map((_rack, i) => {
        const entry = outcome.result.racks[i];

        if (entry == null) {
          return { unreadable: "the remote script gave no answer for it" };
        }

        return "mapped" in entry
          ? { mapped: entry.mapped }
          : { unreadable: entry.error };
      }),
    };
  } catch (error) {
    return { answers: racks.map(() => ({ unreadable: errorMessage(error) })) };
  }
}
