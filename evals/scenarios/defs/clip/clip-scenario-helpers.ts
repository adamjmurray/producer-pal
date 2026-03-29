// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared assertion helpers for clip evaluation scenarios.
 */

import { getToolCalls } from "../../assertions/index.ts";
import { type EvalAssertion, type EvalTurnResult } from "../../types.ts";

/**
 * Create a custom assertion that verifies clips were found and notes were read.
 * Checks that only ppal-read-* tools were called and at least one read included
 * "notes" in the include array.
 *
 * @param turn - Turn index to check
 * @returns Custom assertion for clip reading
 */
export function assertNotesRead(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: "clips were found and notes were read",
    assert: (turns: EvalTurnResult[]) => {
      const calls = getToolCalls(turns, turn);
      let notesRead = false;

      for (const { name, args } of calls) {
        if (!name.startsWith("ppal-read-")) {
          throw new Error(`unexpected non-read tool call: ${name}`);
        }

        if (
          name !== "ppal-read-live-set" &&
          Array.isArray(args.include) &&
          args.include.includes("notes")
        ) {
          notesRead = true;
        }
      }

      if (!notesRead) {
        throw new Error("the clip notes should have been read");
      }

      return true;
    },
  };
}

/**
 * Extract the transforms string from a ppal-update-clip call in the given turn.
 * Throws descriptive errors if the tool call or transforms parameter is missing.
 *
 * @param turns - All turn results
 * @param turn - Turn index to extract from
 * @param toolName - Tool name to look for
 * @returns The transforms string
 */
export function getTransforms(
  turns: EvalTurnResult[],
  turn: number,
  toolName: string,
): string {
  const calls = getToolCalls(turns, turn);
  const updateCall = calls.find((c) => c.name === toolName);

  if (!updateCall) throw new Error(`${toolName} not found in turn ${turn}`);

  const transforms = String(updateCall.args.transforms ?? "");

  if (!transforms) {
    throw new Error(`transforms parameter missing in turn ${turn}`);
  }

  return transforms;
}
