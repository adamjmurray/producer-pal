// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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

    if (part.type === "tool" || part.type === "step-usage") {
      run.parts.push(part);
      run.indices.push(i);

      if (part.type === "tool") toolCount++;
    } else {
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
