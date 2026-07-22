// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";

interface SystemPromptNoticeProps {
  /** The resolved system instruction this conversation runs with. */
  systemInstruction: string;
}

/**
 * Subdued, collapsible notice at the very top of the transcript showing the
 * system prompt the conversation runs with. Collapsed by default to a single
 * truncated line (like a quiet header, not a message bubble); clicking expands
 * it to the full text. Deliberately low-contrast so it frames the conversation
 * without competing with the message bubbles.
 * @param props - Notice props
 * @returns The notice element
 */
export function SystemPromptNotice(
  props: SystemPromptNoticeProps,
): preact.JSX.Element {
  const { systemInstruction } = props;
  const [expanded, setExpanded] = useState(false);
  const firstLine = systemInstruction.split("\n")[0]?.trim() ?? "";

  return (
    <div className="col-span-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-1.5 text-left text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-400 transition-colors"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          <path d="M3 1.5L6.5 5L3 8.5" />
        </svg>
        <span className="shrink-0 font-medium uppercase tracking-wide">
          System prompt
        </span>
        {!expanded && (
          <span className="min-w-0 truncate text-zinc-400 dark:text-zinc-500">
            {firstLine}
          </span>
        )}
      </button>
      {expanded && (
        <pre className="mt-1.5 ml-4 max-h-64 overflow-auto whitespace-pre-wrap border-l-2 border-zinc-200 dark:border-zinc-700 pl-3 text-xs text-zinc-500 dark:text-zinc-400">
          {systemInstruction}
        </pre>
      )}
    </div>
  );
}
