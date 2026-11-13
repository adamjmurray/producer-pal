// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Finding the writes a scenario never wants, in a run's tool calls: notes
 * sent to a clip, clips created, things deleted.
 */

import { argText } from "../../../arg-text.ts";
import {
  getAllToolCalls,
  toolCallFailed,
} from "../../../../assertions/index.ts";
import { type EvalTurnResult, type ToolCall } from "../../../../types.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/**
 * Every create-clip or update-clip call that carried notes, refused or not.
 *
 * @param turns - All conversation turns
 * @returns The calls that tried to write notes
 */
export function noteWrites(turns: EvalTurnResult[]): ToolCall[] {
  return getAllToolCalls(turns).filter(
    (call) =>
      (call.name === TOOLS.createClip || call.name === TOOLS.updateClip) &&
      argText(call.args.notes) !== "",
  );
}

/**
 * The update-clip note writes the tool refused.
 *
 * @param turns - All conversation turns
 * @returns The refused calls
 */
export function refusedNoteWrites(turns: EvalTurnResult[]): ToolCall[] {
  return noteWrites(turns).filter(
    (call) => call.name === TOOLS.updateClip && toolCallFailed(call),
  );
}

/**
 * What a run did that it should not have: notes that landed, any clip created,
 * anything deleted. A refused note write is not one of them.
 *
 * @param turns - All conversation turns
 * @returns One line per offending call, empty when there are none
 */
export function strayWrites(turns: EvalTurnResult[]): string[] {
  const landed = noteWrites(turns)
    .filter((call) => !toolCallFailed(call))
    .map((call) => `${call.name} wrote notes to ${argText(call.args.path)}`);
  const others = getAllToolCalls(turns)
    .filter(
      (call) => call.name === TOOLS.createClip || call.name === TOOLS.delete,
    )
    .map((call) => `${call.name} ${argText(call.args.path)}`.trim());

  return [...landed, ...others];
}
