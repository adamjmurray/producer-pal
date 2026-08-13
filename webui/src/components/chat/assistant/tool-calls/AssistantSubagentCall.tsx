// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CANCELED_TOOL_RESULT_TEXT } from "#webui/chat/sdk/build-model-messages";
import { SUBAGENT_LABEL_PATTERN } from "#webui/chat/sdk/subagent/spawn-subagent-tool";
import {
  type SubagentRateLimitStatus,
  getSubagentRateLimit,
  subscribeToSubagentRateLimits,
} from "#webui/chat/sdk/subagent/subagent-rate-limit";
import { DisclosureChevron } from "#webui/components/chat/controls/header/HeaderIcons";
import { sanitizeMarkdown } from "#webui/lib/utils/sanitize-markdown";
import { truncateString } from "#webui/lib/utils/truncate-string";

interface AssistantSubagentCallProps {
  task: string;
  result: string | null;
  isError?: boolean;
  isResponding?: boolean;
  /** Spawn tool-call id, used to pick up the worker's live rate-limit backoff. */
  toolCallId?: string;
  /** Rendered worker transcript for the deep-dive tier; omitted when none. */
  transcript?: ComponentChildren;
  /** Which subagent ran (1-based); omitted for spawns predating numbering. */
  index?: number;
  /** True when this run continued an existing subagent rather than starting one. */
  resumed?: boolean;
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
 * @param {string} [root0.toolCallId] - Spawn tool-call id for live status lookup
 * @param {ComponentChildren} [root0.transcript] - Rendered worker transcript
 * @param {number} [root0.index] - Which subagent ran (1-based)
 * @param {boolean} [root0.resumed] - Whether this run continued an existing subagent
 * @returns {JSX.Element} - React component
 */
export function AssistantSubagentCall({
  task,
  result,
  isError,
  isResponding,
  toolCallId,
  transcript,
  index,
  resumed,
}: AssistantSubagentCallProps) {
  const running = result == null;
  const returnValue = unwrapResult(result);
  // A worker waiting out a 429 is still "running" as far as the tool result is
  // concerned; without this the card would sit on "working…" through a backoff
  // that can last minutes.
  const rateLimit = useSubagentRateLimit(running ? toolCallId : undefined);
  // A wait forced by a sibling's backoff (attempt null) is not this worker's own
  // rate limit — the docs promise that shared pause, so name it distinctly.
  const waiting = running && rateLimit != null;
  // Stop mid-worker leaves the synthetic canceled result here, which is not a
  // failure and certainly not "done" — and the worker is resumable from this
  // card's transcript, so say what actually happened.
  const stopped = !running && returnValue === CANCELED_TOOL_RESULT_TEXT;
  const status = waiting
    ? rateLimit.attempt == null
      ? "waiting"
      : "rate limited"
    : running
      ? "working…"
      : isError
        ? "failed"
        : stopped
          ? "stopped"
          : "done";

  return (
    <details
      className={`${baseClasses} ${running && isResponding ? "animate-pulse" : ""} ${
        isError ? "border-red-500" : ""
      }`}
    >
      <summary className="flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
        <DisclosureChevron />🤖{" "}
        <span className="font-semibold">
          {index == null ? "subagent" : `subagent ${index}`}
        </span>
        {resumed && (
          <span className="shrink-0 text-indigo-700 dark:text-indigo-300">
            resumed
          </span>
        )}
        <span className="truncate min-w-0 text-zinc-600 dark:text-zinc-400">
          {truncateString(task, 80)}
        </span>
        <span className={`ml-auto shrink-0 ${statusColor(isError, waiting)}`}>
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

      {waiting && <RateLimitNotice status={rateLimit} />}

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
 * The waiting-it-out line shown while a worker serves a rate-limit backoff, so
 * a multi-minute wait reads as a countdown rather than a hung subagent.
 * @param {object} root0 - Component props
 * @param {SubagentRateLimitStatus} root0.status - The backoff in progress
 * @returns {JSX.Element} - React component
 */
function RateLimitNotice({ status }: { status: SubagentRateLimitStatus }) {
  const seconds = useSecondsUntil(status.retryAtMs);

  return (
    <div className="mt-2 text-amber-700 dark:text-amber-400">
      {status.attempt == null ? (
        <>Another subagent hit a rate limit — starting in {seconds}s</>
      ) : (
        <>
          Rate limited — retrying in {seconds}s (attempt {status.attempt + 1} of{" "}
          {status.maxAttempts})
        </>
      )}
    </div>
  );
}

/**
 * Subscribe a card to its worker's rate-limit backoff. The worker runs below
 * the orchestrator's stream, so this out-of-band store — not the message
 * history — is the only thing that can re-render the card while it waits.
 * @param {string} [toolCallId] - The spawn tool-call id; undefined for a
 *   finished call or restored history predating ids (then there is no status)
 * @returns {SubagentRateLimitStatus | null} The backoff, or null when not waiting
 */
function useSubagentRateLimit(
  toolCallId: string | undefined,
): SubagentRateLimitStatus | null {
  const [status, setStatus] = useState<SubagentRateLimitStatus | null>(null);

  useEffect(() => {
    if (toolCallId == null) {
      setStatus(null);

      return undefined;
    }

    setStatus(getSubagentRateLimit(toolCallId));

    return subscribeToSubagentRateLimits(() =>
      setStatus(getSubagentRateLimit(toolCallId)),
    );
  }, [toolCallId]);

  return status;
}

/**
 * Whole seconds left until a deadline, ticking down twice a second.
 * @param {number} targetMs - Epoch ms the countdown runs to
 * @returns {number} Seconds remaining, floored at 0
 */
function useSecondsUntil(targetMs: number): number {
  const [remainingMs, setRemainingMs] = useState(() => targetMs - Date.now());

  useEffect(() => {
    setRemainingMs(targetMs - Date.now());

    const interval = setInterval(
      () => setRemainingMs(targetMs - Date.now()),
      500,
    );

    return () => clearInterval(interval);
  }, [targetMs]);

  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/**
 * Status-chip color: red for a failed call, amber while rate-limited, muted
 * otherwise.
 * @param {boolean} [isError] - Whether the subagent call failed
 * @param {boolean} [isRateLimited] - Whether the worker is serving a backoff
 * @returns {string} Tailwind color classes
 */
function statusColor(isError?: boolean, isRateLimited?: boolean): string {
  if (isError) return "text-red-700 dark:text-red-400";

  if (isRateLimited) return "text-amber-700 dark:text-amber-400";

  return "text-zinc-500";
}

/**
 * Unwrap a tool-result string for display. Subagent results are JSON-stringified
 * plain strings (e.g. `"\"Done.\""`); parse those back to the bare text. Anything
 * that isn't a JSON string is shown verbatim.
 *
 * The `[subagent N]` label the model needs in order to resume this worker is
 * dropped here — the card's own header already says which subagent this is.
 * @param {string | null} result - The formatted tool result, or null while running
 * @returns {string} The display text
 */
function unwrapResult(result: string | null): string {
  if (result == null) return "";

  try {
    const parsed: unknown = JSON.parse(result);

    return (typeof parsed === "string" ? parsed : result).replace(
      SUBAGENT_LABEL_PATTERN,
      "",
    );
  } catch {
    return result.replace(SUBAGENT_LABEL_PATTERN, "");
  }
}
