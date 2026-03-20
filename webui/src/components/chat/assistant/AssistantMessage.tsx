// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo } from "preact/hooks";
import { type TokenUsage } from "#webui/chat/ai-sdk/ai-sdk-types";
import {
  calcNewContentTokens,
  compactNumber,
} from "#webui/lib/utils/compact-number";
import { type UIPart } from "#webui/types/messages";
import { AssistantError } from "./AssistantError";
import { AssistantText } from "./AssistantText";
import { AssistantThought } from "./AssistantThought";
import { AssistantToolCall } from "./AssistantToolCall";

interface AssistantMessageProps {
  parts: UIPart[];
  isResponding?: boolean;
  showTokenUsage?: boolean;
  prevStepUsage?: TokenUsage;
}

/**
 * Renders assistant message with multiple part types
 * @param {AssistantMessageProps} root0 - Component props
 * @param {UIPart[]} root0.parts - Message parts to render
 * @param {boolean} [root0.isResponding] - Whether assistant is currently responding
 * @param {boolean} [root0.showTokenUsage] - Whether to show per-step token usage
 * @param {TokenUsage} [root0.prevStepUsage] - Previous message's last usage
 * @returns {JSX.Element} - React component
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

  return (
    <div className="flex flex-col gap-3 py-2">
      {parts.map((part, i) => {
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
        } else if (part.type === "step-usage") {
          if (!showTokenUsage) return null;

          const prev = stepPrevUsages.get(i);
          const newContent = calcNewContentTokens(
            part.usage.inputTokens ?? 0,
            prev?.inputTokens,
            prev?.outputTokens,
          );

          return (
            <StepUsageLabel
              key={i}
              usage={part.usage}
              newContentTokens={newContent}
            />
          );
        } else if (part.type === "text") {
          return <AssistantText key={i} content={part.content} />;
        }

        // TypeScript has narrowed this to UIErrorPart
        return <AssistantError key={i} content={part.content} />;
      })}
    </div>
  );
}

/**
 * Build a map of step-usage part index → previous step's usage.
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

    if (part?.type === "step-usage") {
      if (prev) map.set(i, prev);
      prev = part.usage;
    }
  }

  return map;
}

/**
 * Compact usage label shown between tool call steps and follow-up text.
 * @param props - Component props
 * @param props.usage - Token usage for this step
 * @param props.newContentTokens - New content tokens (null if not calculable)
 * @returns Label element
 */
function StepUsageLabel({
  usage,
  newContentTokens,
}: {
  usage: TokenUsage;
  newContentTokens: number | null;
}) {
  return (
    <div className="text-xs text-zinc-400 dark:text-zinc-500 text-right -mt-1">
      tokens: {compactNumber(usage.inputTokens ?? 0)}
      {newContentTokens != null &&
        ` (${compactNumber(newContentTokens)} new)`}{" "}
      → {compactNumber(usage.outputTokens ?? 0)}
      {(usage.reasoningTokens ?? 0) > 0 &&
        ` (${compactNumber(usage.reasoningTokens ?? 0)} reasoning)`}
    </div>
  );
}
