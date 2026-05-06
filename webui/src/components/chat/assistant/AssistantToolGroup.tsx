// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isErrorResult } from "#webui/chat/helpers/formatter-helpers";
import { DisclosureChevron } from "#webui/components/chat/controls/header/HeaderIcons";
import { useToolNames } from "#webui/hooks/connection/tool-names-context";
import { type UIStepUsagePart, type UIToolPart } from "#webui/types/messages";
import { AssistantToolCall } from "./AssistantToolCall";

interface AssistantToolGroupProps {
  parts: (UIToolPart | UIStepUsagePart)[];
  indices: number[];
}

/**
 * Renders a collapsible group of 3+ consecutive tool calls.
 * Step-usage parts are rendered by the parent (AssistantMessage) outside the group.
 * @param props - Component props
 * @param props.parts - Tool and step-usage parts in the group
 * @param props.indices - Original part indices (for React keys)
 * @returns Grouped disclosure element
 */
export function AssistantToolGroup({
  parts,
  indices,
}: AssistantToolGroupProps) {
  const toolNames = useToolNames();
  const toolParts = parts.filter((p): p is UIToolPart => p.type === "tool");
  const firstTool = toolParts[0];
  const otherCount = toolParts.length - 1;

  const hasPending = toolParts.some((t) => t.result == null);
  const hasError = toolParts.some(
    (t) => t.isError ?? (t.result != null && isErrorResult(t.result)),
  );
  const errorCount = toolParts.filter(
    (t) => t.isError ?? (t.result != null && isErrorResult(t.result)),
  ).length;

  const firstName = firstTool
    ? (toolNames[firstTool.name] ?? firstTool.name)
    : "tools";

  return (
    <details
      className={`disclosure text-xs p-2 font-mono bg-zinc-400/50 dark:bg-zinc-900 rounded-lg ${
        hasPending ? "animate-pulse" : ""
      } ${hasError ? "border-l-3 border-red-500" : ""}`}
    >
      <summary className="flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
        <DisclosureChevron />
        🛠️ {hasPending ? "using tools: " : ""}
        {firstName} and {otherCount} other tool{otherCount !== 1 ? "s" : ""}
        {hasError && !hasPending && (
          <span className="text-red-700 dark:text-red-400 font-normal">
            {" "}
            — {errorCount} failed
          </span>
        )}
      </summary>
      <div className="flex flex-col gap-2 mt-2">
        {parts.map((part, i) => {
          if (part.type !== "tool") return null;

          const originalIndex = indices[i] as number;

          return (
            <AssistantToolCall
              key={originalIndex}
              name={part.name}
              args={part.args}
              result={part.result}
              isError={part.isError}
            />
          );
        })}
      </div>
    </details>
  );
}
