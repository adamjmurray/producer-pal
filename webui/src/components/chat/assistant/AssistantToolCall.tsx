// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isErrorResult } from "#webui/chat/helpers/formatter-helpers";
import { DisclosureChevron } from "#webui/components/chat/controls/header/HeaderIcons";
import { useToolNames } from "#webui/hooks/connection/tool-names-context";
import { truncateString } from "#webui/lib/utils/truncate-string";
import { extractErrorSummary } from "./helpers/tool-call-error-helpers";
import { extractWarnings } from "./helpers/tool-call-warning-helpers";

interface AssistantToolCallProps {
  name: string;
  args: Record<string, unknown>;
  result: string | null;
  isError?: boolean;
}

/**
 * Displays tool call with args and result
 * @param {AssistantToolCallProps} root0 - Component props
 * @param {string} root0.name - Tool name
 * @param {Record<string, unknown>} root0.args - Tool arguments
 * @param {string | null} root0.result - Tool result or null if pending
 * @param {boolean} [root0.isError] - Whether tool call failed
 * @returns {JSX.Element} - React component
 */
export function AssistantToolCall({
  name,
  args,
  result,
  isError,
}: AssistantToolCallProps) {
  const toolNames = useToolNames();
  const effectiveIsError = isError ?? (result != null && isErrorResult(result));
  const errorSummary =
    effectiveIsError && result ? extractErrorSummary(result) : null;
  const warnings = !effectiveIsError && result ? extractWarnings(result) : [];
  const hasWarnings = warnings.length > 0;

  return (
    <details
      className={`disclosure text-xs p-2 font-mono bg-zinc-200/70 dark:bg-zinc-900 rounded-lg ${
        result ? "" : "animate-pulse"
      } ${effectiveIsError ? "border-l-3 border-red-500" : hasWarnings ? "border-l-3 border-yellow-500" : ""}`}
    >
      <summary className="flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
        <DisclosureChevron />
        🔧{" "}
        {!result ? (
          "using tool: "
        ) : effectiveIsError ? (
          <span className="text-red-700 dark:text-red-400">tool failed: </span>
        ) : (
          "used tool: "
        )}
        {toolNames[name] ?? name}
        {effectiveIsError && (
          <span className="text-red-700 dark:text-red-400 font-normal">
            {" "}
            — {truncateString(errorSummary ?? "error", 80)}
          </span>
        )}
        {hasWarnings && (
          <span className="text-yellow-700 dark:text-yellow-400 font-normal">
            {" — warning: "}
            {truncateString(warnings[0], 80)}
            {warnings.length > 1 &&
              ` + ${warnings.length - 1} other warning${warnings.length > 2 ? "s" : ""}`}
          </span>
        )}
      </summary>
      <div className="mt-1 p-1 break-all text-zinc-500 dark:text-zinc-500">
        {name}({JSON.stringify(args, null, 0)})
      </div>
      {result && (
        <details className="disclosure">
          <summary className="px-2 my-1 truncate text-zinc-600 dark:text-zinc-400 flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
            <DisclosureChevron />↳ {truncateString(result, 300)}
          </summary>
          <div className="mt-1 p-1 break-all text-zinc-500 dark:text-zinc-500">
            <FullResultDetails result={result} />
          </div>
        </details>
      )}
    </details>
  );
}

/**
 * Formats and displays full tool result with JSON formatting
 * @param {object} root0 - Component props
 * @param {string} root0.result - Tool result to format
 * @returns {JSX.Element} - React component
 */
function FullResultDetails({ result }: { result: string }) {
  const s = `${result}`;
  let formatted: string | null = null;

  if (s.startsWith("{") || s.startsWith("[") || s.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(s);
      const display =
        typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);

      formatted = display.replaceAll("\\n", "\n");
    } catch {
      // JSON parsing failed, will render as plain text
    }
  }

  if (formatted) {
    return <pre className="whitespace-pre-wrap">{formatted}</pre>;
  }

  return <>{s}</>;
}
