// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useEffect, useState } from "preact/hooks";

// Says both things a reader needs at the link: where it goes, and that this
// conversation keeps the prompt it locked at its first turn.
const CUSTOMIZE_TITLE =
  "Edit your custom instructions. This conversation keeps the prompt it started with — edits apply to new chats.";

interface SystemPromptNoticeProps {
  /** The resolved system instruction this conversation runs with. */
  systemInstruction: string;
  /** Imported conversation whose prompt differs from the user's: warn and show it in full. */
  importedPromptDiffers?: boolean;
  /** Opens the context editor's Instructions tab; omitted in voice/demo. */
  onOpenInstructions?: () => void;
}

/**
 * Subdued, collapsible notice at the very top of the transcript showing the
 * system prompt the conversation runs with. Collapsed by default to a single
 * truncated line (like a quiet header, not a message bubble); clicking expands
 * it to the full text. Deliberately low-contrast so it frames the conversation
 * without competing with the message bubbles. A "customize" link sits beside it
 * when the Instructions tab is reachable. An imported conversation with a
 * different prompt gets a warning and starts expanded, so the user sees all of
 * what the model will follow.
 * @param props - Notice props
 * @returns The notice element
 */
export function SystemPromptNotice(
  props: SystemPromptNoticeProps,
): preact.JSX.Element {
  const { systemInstruction, importedPromptDiffers, onOpenInstructions } =
    props;
  const [expanded, setExpanded] = useState(importedPromptDiffers === true);

  // Mounted before the warning applies, or kept across a switch to another
  // imported conversation: show the full prompt whenever it turns on or changes.
  useEffect(() => {
    if (importedPromptDiffers === true) {
      setExpanded(true);
    }
  }, [importedPromptDiffers, systemInstruction]);

  const firstLine = systemInstruction.split("\n")[0]?.trim() ?? "";

  return (
    <div className="col-span-3">
      {importedPromptDiffers === true && (
        <p
          role="alert"
          className="mb-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        >
          Imported conversation: its system prompt differs from yours. Review it
          below, since the model will follow it.
        </p>
      )}
      <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left transition-colors hover:text-zinc-600 dark:hover:text-zinc-400"
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
          <span className="shrink-0 font-medium tracking-wide uppercase">
            System prompt
          </span>
          {!expanded && (
            <span className="min-w-0 truncate text-zinc-400 dark:text-zinc-500">
              {firstLine}
            </span>
          )}
        </button>
        {onOpenInstructions != null && (
          <button
            type="button"
            onClick={onOpenInstructions}
            aria-label="Customize system prompt"
            title={CUSTOMIZE_TITLE}
            className="shrink-0 underline transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            customize
          </button>
        )}
      </div>
      {expanded && (
        <pre className="mt-1.5 ml-4 max-h-64 overflow-auto border-l-2 border-zinc-200 pl-3 text-xs whitespace-pre-wrap text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {systemInstruction}
        </pre>
      )}
    </div>
  );
}
