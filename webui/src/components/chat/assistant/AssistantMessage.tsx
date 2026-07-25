// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ComponentChildren, Fragment } from "preact";
import { useMemo } from "preact/hooks";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/chat/sdk/spawn-subagent-tool";
import { type TokenUsage } from "#webui/chat/sdk/types";
import {
  type UIMessage,
  type UIPart,
  type UIStepUsagePart,
} from "#webui/types/messages";
import { AssistantError } from "./AssistantError";
import { AssistantText } from "./AssistantText";
import { AssistantThought } from "./AssistantThought";
import {
  type SingleRenderItem,
  type ToolGroupRenderItem,
  groupToolParts,
} from "./helpers/group-tool-parts";
import { StepUsageLabel, calcStepNewContent } from "./StepUsageLabel";
import { AssistantSubagentCall } from "./tool-calls/AssistantSubagentCall";
import { AssistantToolCall } from "./tool-calls/AssistantToolCall";
import { AssistantToolGroup } from "./tool-calls/AssistantToolGroup";

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
    if (part.name === SPAWN_SUBAGENT_TOOL_NAME) {
      return (
        <AssistantSubagentCall
          key={i}
          task={String(part.args.task ?? "")}
          result={part.result}
          isError={part.isError}
          isResponding={isResponding}
          toolCallId={part.id}
          transcript={renderSubagentTranscript(part.subagentMessages)}
          index={part.subagentIndex}
          resumed={part.args.resumeFrom != null}
        />
      );
    }

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
 * Render a subagent's worker transcript for the card's deep-dive tier: user
 * turns as compact bubbles, assistant turns through the same AssistantMessage
 * component the main chat uses. Workers can't spawn, so this never recurses into
 * another subagent card.
 * @param messages - The formatted worker transcript, if any
 * @returns Rendered transcript nodes, or undefined when there is nothing to show
 */
function renderSubagentTranscript(
  messages: UIMessage[] | undefined,
): ComponentChildren {
  if (!messages || messages.length === 0) return undefined;

  return messages.map((m, idx) =>
    m.role === "user" ? (
      <div
        key={idx}
        className="text-xs bg-blue-100 dark:bg-blue-900/60 rounded px-2 py-1 whitespace-pre-wrap wrap-break-word"
      >
        {userTranscriptText(m)}
      </div>
    ) : (
      <AssistantMessage key={idx} parts={m.parts} />
    ),
  );
}

/**
 * Concatenate a transcript user message's text parts into a plain string.
 * @param message - A user UIMessage from a worker transcript
 * @returns The joined text content
 */
function userTranscriptText(message: UIMessage): string {
  return message.parts
    .map((part) => ("content" in part ? part.content : ""))
    .join("");
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
