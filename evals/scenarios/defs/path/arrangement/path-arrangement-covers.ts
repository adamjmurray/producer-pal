// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: an arrangement coordinate names the clip that COVERS it.
 *
 * A 4-bar clip at bar 1 runs through bar 4, so "the clip playing at bar 3" is
 * `t3[3|1]` — no need to find where the clip starts. This grades that the model
 * trusts that: one `ppal-update-clip` renames the clip, by a bar-3 path or by
 * the id a `ppal-read-clip` at bar 3 returned. Reads before the write are
 * harmless and not graded. Writing to another bar (`t3[1|1]`), or by an id read
 * from the clip's start, means it went looking for the start.
 *
 * `kind: "capability"` — an improvement target, not a regression guard.
 */

import {
  getAllToolCalls,
  parsedToolResult,
} from "../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type ToolCall,
} from "../../../types.ts";
import { argText } from "../../arg-text.ts";
import {
  TOOL_READ_CLIP,
  TOOL_UPDATE_CLIP,
} from "../../clip/helpers/clip-tool-constants.ts";
import { arrangementRenameScenario } from "../../helpers/arrangement-rename-scenario.ts";
import { listEntries } from "../path-assertions.ts";

const CLIP_NAME = "Long One";

/** Lead is track 3; bar 3 is inside the clip and not where it starts. */
const COVERED_PATH = /^t3\[3\|[\d.]+\]$/;

/**
 * The model trusts the covering coordinate instead of hunting for the start.
 * Graded on the write: reads are free, but an id only counts if a bar-3 read
 * returned it.
 * @param turn - Turn index to grade
 * @returns A custom assertion over every call the turn made
 */
function assertTrustsCoveringBar(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: "renames by the bar-3 coordinate, never by the clip's start",
    assert: (turns) => {
      const calls = getAllToolCalls(turns, turn);
      const reads = calls.filter((call) => call.name === TOOL_READ_CLIP);
      const writes = calls.filter((call) => call.name === TOOL_UPDATE_CLIP);

      if (writes.length !== 1) {
        throw new Error(
          `${String(writes.length)} ${TOOL_UPDATE_CLIP} calls, expected 1: ` +
            writes.map(describeTarget).join("; "),
        );
      }

      assertWriteNamesCoveredClip(writes[0], reads);

      return true;
    },
  };
}

/**
 * The write names the clip by a bar-3 path, or by the id a bar-3 read returned.
 * @param write - The single update-clip call
 * @param reads - Every read-clip call in the turn
 */
function assertWriteNamesCoveredClip(
  write: ToolCall | undefined,
  reads: ToolCall[],
): void {
  if (write == null) {
    return;
  }

  const paths = listEntries(write.args.path);

  if (paths.length > 0) {
    if (paths.some((path) => !COVERED_PATH.test(path.replaceAll(" ", "")))) {
      throw new Error(
        `${TOOL_UPDATE_CLIP} path '${argText(write.args.path)}' is not a ` +
          `bar-3 coordinate on track 3 (t3[3|1])`,
      );
    }

    return;
  }

  const ids = listEntries(write.args.ids ?? write.args.id);
  const readIds = reads
    .filter((call) =>
      listEntries(call.args.path).every((path) =>
        COVERED_PATH.test(path.replaceAll(" ", "")),
      ),
    )
    .map((call) => argText(parsedToolResult(call)?.id));

  if (ids.length === 0 || !ids.every((id) => readIds.includes(id))) {
    throw new Error(
      `${TOOL_UPDATE_CLIP} named the clip by ${describeTarget(write)}, ` +
        `which is neither a bar-3 path nor the id of a ${TOOL_READ_CLIP} at ` +
        `bar 3 (ids read: ${readIds.join(", ") || "none"})`,
    );
  }
}

/**
 * How a call names its target, for failure text.
 * @param call - The tool call
 * @returns The path, id or ids it carried
 */
function describeTarget(call: ToolCall): string {
  return (
    ["path", "ids", "id"]
      .filter((key) => call.args[key] != null)
      .map((key) => `${key}=${argText(call.args[key])}`)
      .join(", ") || "nothing"
  );
}

export const pathArrangementCovers: EvalScenario = arrangementRenameScenario({
  id: "path-arrangement-covers",
  description: "Address the arrangement clip covering a bar by that bar",
  renameMessage: `Rename the arrangement clip that's playing at bar 3 to "${CLIP_NAME}".`,
  name: CLIP_NAME,
  assertions: [assertTrustsCoveringBar(2)],
  maxTokens: 2_500,
});
