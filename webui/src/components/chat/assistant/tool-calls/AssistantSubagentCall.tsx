// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ComponentChildren } from "preact";
import { DisclosureChevron } from "#webui/components/chat/controls/header/HeaderIcons";
import { sanitizeMarkdown } from "#webui/lib/utils/sanitize-markdown";
import { truncateString } from "#webui/lib/utils/truncate-string";

interface AssistantSubagentCallProps {
  task: string;
  result: string | null;
  isError?: boolean;
  isResponding?: boolean;
  /** Rendered worker transcript for the deep-dive tier; omitted when none. */
  transcript?: ComponentChildren;
}

const baseClasses =
  "disclosure text-xs p-2 bg-zinc-200/70 dark:bg-zinc-700 rounded-lg border-l-3 border-indigo-500";

/**
 * Subagent (spawn_subagent) tool call rendered as a three-tier disclosure:
 * (1) a collapsed summary line — icon, task, status, return-value preview;
 * (2) expanded — the full return value the orchestrator received;
 * (3) a nested, collapsed disclosure — the full worker transcript.
 * @param {AssistantSubagentCallProps} root0 - Component props
 * @param {string} root0.task - The delegated task text
 * @param {string | null} root0.result - Compact return value, or null while running
 * @param {boolean} [root0.isError] - Whether the subagent call failed
 * @param {boolean} [root0.isResponding] - Whether the assistant is still responding
 * @param {ComponentChildren} [root0.transcript] - Rendered worker transcript
 * @returns {JSX.Element} - React component
 */
export function AssistantSubagentCall({
  task,
  result,
  isError,
  isResponding,
  transcript,
}: AssistantSubagentCallProps) {
  const running = result == null;
  const returnValue = unwrapResult(result);
  const status = running ? "working…" : isError ? "failed" : "done";

  return (
    <details
      className={`${baseClasses} ${running && isResponding ? "animate-pulse" : ""} ${
        isError ? "border-red-500" : ""
      }`}
    >
      <summary className="flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
        <DisclosureChevron />
        🤖 <span className="font-semibold">subagent</span>
        <span className="truncate min-w-0 text-zinc-600 dark:text-zinc-400">
          {truncateString(task, 80)}
        </span>
        <span
          className={`ml-auto shrink-0 ${isError ? "text-red-700 dark:text-red-400" : "text-zinc-500"}`}
        >
          {status}
        </span>
      </summary>

      {running ? (
        <div className="mt-2 text-zinc-500 dark:text-zinc-400">
          Working on {truncateString(task, 120)}…
        </div>
      ) : (
        <div
          className="mt-2 prose dark:prose-invert prose-sm max-w-none wrap-break-word"
          dangerouslySetInnerHTML={{ __html: sanitizeMarkdown(returnValue) }}
        />
      )}

      {transcript != null && (
        <details className="disclosure mt-2">
          <summary className="text-zinc-600 dark:text-zinc-400 flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
            <DisclosureChevron />↳ subagent transcript
          </summary>
          <div className="mt-2 flex flex-col gap-2 border-l-2 border-zinc-300 dark:border-zinc-600 pl-2">
            {transcript}
          </div>
        </details>
      )}
    </details>
  );
}

/**
 * Unwrap a tool-result string for display. Subagent results are JSON-stringified
 * plain strings (e.g. `"\"Done.\""`); parse those back to the bare text. Anything
 * that isn't a JSON string is shown verbatim.
 * @param {string | null} result - The formatted tool result, or null while running
 * @returns {string} The display text
 */
function unwrapResult(result: string | null): string {
  if (result == null) return "";

  try {
    const parsed: unknown = JSON.parse(result);

    return typeof parsed === "string" ? parsed : result;
  } catch {
    return result;
  }
}
