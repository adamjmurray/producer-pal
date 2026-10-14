// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Finding the track a `convert` made, so a grading read can look at it wherever
 * Live put it.
 */

import {
  getAllToolCalls,
  parsedToolResult,
  toolCallFailed,
} from "../../../assertions/index.ts";
import { type EvalTurnResult } from "../../../types.ts";
import { TOOL_UPDATE_CLIP } from "./clip-tool-constants.ts";

/**
 * Where the new track lands when no convert result names it: right after the
 * source track, which is t5 in the scenarios that seed one audio track.
 */
const AFTER_SEEDED_TRACK = "t6";

/**
 * The path of the track the last successful `convert` reported, or the track
 * just after the seeded audio one when no call did.
 *
 * @param turns - All conversation turns
 * @returns A track path, e.g. "t6"
 */
export function convertedTrackPath(turns: EvalTurnResult[]): string {
  const paths = getAllToolCalls(turns)
    .filter(
      (call) =>
        call.name === TOOL_UPDATE_CLIP &&
        call.args.convert != null &&
        !toolCallFailed(call),
    )
    .flatMap((call) => {
      const result = parsedToolResult(call) as unknown;
      const entries = Array.isArray(result) ? result : [result];

      return entries.map(
        (entry) =>
          (entry as { converted?: { track?: { path?: unknown } } } | null)
            ?.converted?.track?.path,
      );
    })
    .filter((path): path is string => typeof path === "string");

  return paths.at(-1) ?? AFTER_SEEDED_TRACK;
}
