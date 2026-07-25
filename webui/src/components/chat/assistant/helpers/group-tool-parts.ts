// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/chat/sdk/subagent/spawn-subagent-tool";
import {
  type UIPart,
  type UIStepUsagePart,
  type UIToolPart,
} from "#webui/types/messages";

export interface SingleRenderItem {
  kind: "single";
  part: UIPart;
  index: number;
}

export interface ToolGroupRenderItem {
  kind: "tool-group";
  parts: (UIToolPart | UIStepUsagePart)[];
  indices: number[];
}

export type RenderItem = SingleRenderItem | ToolGroupRenderItem;

const MIN_GROUP_SIZE = 3;

/**
 * Whether a part participates in tool-call grouping. Ordinary tool calls and the
 * step-usage markers between them do; a spawn_subagent call does NOT — it always
 * renders as its own specialized card (never collapsed into a generic group),
 * which keeps parallel spawns individually visible.
 * @param part - The UI part to classify
 * @returns True when the part can join a tool-call group
 */
function isGroupablePart(part: UIPart): part is UIToolPart | UIStepUsagePart {
  if (part.type === "step-usage") return true;

  return part.type === "tool" && part.name !== SPAWN_SUBAGENT_TOOL_NAME;
}

/**
 * Groups consecutive tool parts (with interleaved step-usage) into collapsible groups.
 * Runs of 3+ tool parts become a single tool-group item; shorter runs stay individual.
 * @param parts - Flat array of UI parts
 * @returns Array of render items with grouping applied
 */
export function groupToolParts(parts: UIPart[]): RenderItem[] {
  const result: RenderItem[] = [];
  let run: { parts: (UIToolPart | UIStepUsagePart)[]; indices: number[] } = {
    parts: [],
    indices: [],
  };
  let toolCount = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] as UIPart;

    if (isGroupablePart(part)) {
      run.parts.push(part);
      run.indices.push(i);

      if (part.type === "tool") toolCount++;
    } else {
      // Subagent calls (and non-tool parts) break the run and render on their
      // own — a subagent renders as its specialized card, never folded into a
      // generic tool group, so parallel spawns each keep their card + transcript.
      flushRun(result, run, toolCount);
      run = { parts: [], indices: [] };
      toolCount = 0;
      result.push({ kind: "single", part, index: i });
    }
  }

  flushRun(result, run, toolCount);

  return result;
}

/**
 * Flush accumulated tool/step-usage run into result array.
 * @param result - Output array to append to
 * @param run - Accumulated parts and indices
 * @param run.parts - Parts in the run
 * @param run.indices - Original indices of parts
 * @param toolCount - Number of tool parts in the run
 */
function flushRun(
  result: RenderItem[],
  run: { parts: (UIToolPart | UIStepUsagePart)[]; indices: number[] },
  toolCount: number,
): void {
  if (run.parts.length === 0) return;

  if (toolCount >= MIN_GROUP_SIZE) {
    result.push({ kind: "tool-group", parts: run.parts, indices: run.indices });
  } else {
    for (let j = 0; j < run.parts.length; j++) {
      result.push({
        kind: "single",
        part: run.parts[j] as UIPart,
        index: run.indices[j] as number,
      });
    }
  }
}
