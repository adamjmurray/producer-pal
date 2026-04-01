// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Fragment } from "preact";
import { useMemo } from "preact/hooks";
import { type TokenUsage } from "#webui/chat/sdk/types";
import { type UIPart, type UIStepUsagePart } from "#webui/types/messages";
import { AssistantError } from "./AssistantError";
import { AssistantText } from "./AssistantText";
import { AssistantThought } from "./AssistantThought";
import { AssistantToolCall } from "./AssistantToolCall";
import { AssistantToolGroup } from "./AssistantToolGroup";
import {
  type SingleRenderItem,
  type ToolGroupRenderItem,
  groupToolParts,
} from "./helpers/group-tool-parts";
import { StepUsageLabel, calcStepNewContent } from "./StepUsageLabel";

interface AssistantMessageProps {
  parts: UIPart[];
  isResponding?: boolean;
  showTokenUsage?: boolean;
  prevStepUsage?: TokenUsage;
}

/**
 * Renders assistant message with multiple part types
 * @param root0 - Component props
 * @param root0.parts - Message parts to render
 * @param root0.isResponding - Whether assistant is currently responding
 * @param root0.showTokenUsage - Whether to show per-step token usage
 * @param root0.prevStepUsage - Previous message's last usage
 * @returns React component
 */
export function AssistantMessage({
  parts,
  isResponding,
  showTokenUsage,
  prevStepUsage,
}: AssistantMessageProps) {
  const stepPrevUsages = useMemo(
    () => buildStepPrevUsages(parts, prevStepUsage),
    [parts, prevStepUsage],
  );

  const renderItems = useMemo(() => groupToolParts(parts), [parts]);

  return (
    <div className="flex flex-col gap-3 py-2">
      {renderItems.map((item) => {
        if (item.kind === "tool-group") {
          return renderToolGroup(item, showTokenUsage, stepPrevUsages);
        }

        return renderSinglePart(
          item,
          isResponding,
          showTokenUsage,
          stepPrevUsages,
        );
      })}
    </div>
  );
}

/**
 * Render a grouped set of 3+ tool calls with step-usage outside the group box.
 * @param item - Tool group render item
 * @param showTokenUsage - Whether to show per-step token usage
 * @param stepPrevUsages - Map from part index to previous step's usage
 * @returns Fragment with group disclosure and trailing step-usage labels
 */
function renderToolGroup(
  item: ToolGroupRenderItem,
  showTokenUsage: boolean | undefined,
  stepPrevUsages: Map<number, TokenUsage>,
) {
  return (
    <Fragment key={`group-${item.indices[0]}`}>
      <AssistantToolGroup parts={item.parts} indices={item.indices} />
      {showTokenUsage &&
        item.parts.map((part, j) => {
          if (!isStepUsagePart(part)) return null;

          const idx = item.indices[j] as number;

          return (
            <StepUsageLabel
              key={idx}
              usage={part.usage}
              newContentTokens={calcStepNewContent(
                idx,
                part.usage,
                stepPrevUsages,
              )}
            />
          );
        })}
    </Fragment>
  );
}

/**
 * Render a single (non-grouped) part.
 * @param item - Single render item
 * @param isResponding - Whether assistant is currently responding
 * @param showTokenUsage - Whether to show per-step token usage
 * @param stepPrevUsages - Map from part index to previous step's usage
 * @returns Rendered element or null
 */
function renderSinglePart(
  item: SingleRenderItem,
  isResponding: boolean | undefined,
  showTokenUsage: boolean | undefined,
  stepPrevUsages: Map<number, TokenUsage>,
) {
  const { part, index: i } = item;

  if (part.type === "thought") {
    return (
      <AssistantThought
        key={i}
        content={part.content}
        isOpen={part.isOpen}
        isResponding={isResponding}
      />
    );
  } else if (part.type === "tool") {
    return (
      <AssistantToolCall
        key={i}
        name={part.name}
        args={part.args}
        result={part.result}
        isError={part.isError}
      />
    );
  } else if (isStepUsagePart(part)) {
    if (!showTokenUsage) return null;

    return (
      <StepUsageLabel
        key={i}
        usage={part.usage}
        newContentTokens={calcStepNewContent(i, part.usage, stepPrevUsages)}
      />
    );
  } else if (part.type === "text") {
    return <AssistantText key={i} content={part.content} />;
  }

  // TypeScript has narrowed this to UIErrorPart
  return <AssistantError key={i} content={part.content} />;
}

/**
 * Type guard for step-usage parts.
 * @param part - Part to check
 * @returns Whether the part is a step-usage part
 */
function isStepUsagePart(
  part: UIPart | { type: string },
): part is UIStepUsagePart {
  return part.type === "step-usage";
}

/**
 * Build a map of step-usage part index to previous step's usage.
 * @param parts - Message parts
 * @param prevStepUsage - Previous message's last usage
 * @returns Map from part index to previous usage
 */
function buildStepPrevUsages(
  parts: UIPart[],
  prevStepUsage: TokenUsage | undefined,
): Map<number, TokenUsage> {
  const map = new Map<number, TokenUsage>();
  let prev = prevStepUsage;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part && isStepUsagePart(part)) {
      if (prev) map.set(i, prev);
      prev = part.usage;
    }
  }

  return map;
}
