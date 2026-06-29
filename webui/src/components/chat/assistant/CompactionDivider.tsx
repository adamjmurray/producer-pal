// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { SafeMarkdown } from "./message-list-helpers";

interface CompactionDividerProps {
  /** Transcript index of the divider's message, so scroll-to-fork can locate it
   *  when a branch anchor lands here (otherwise the anchor has no indexed element). */
  messageIndex: number;
  summary: string;
  canUndo: boolean;
  onUndo?: () => void;
}

/**
 * Renders a compaction summary as a divider in the transcript, with a toggle to
 * view the generated summary and an undo action while it is still available.
 * @param {CompactionDividerProps} root0 - Component props
 * @param {number} root0.messageIndex - Transcript index of the divider's message
 * @param {string} root0.summary - The generated compaction summary text
 * @param {boolean} root0.canUndo - Whether the compaction can still be undone
 * @param {() => void} root0.onUndo - Undo callback
 * @returns {JSX.Element} - React component
 */
export function CompactionDivider({
  messageIndex,
  summary,
  canUndo,
  onUndo,
}: CompactionDividerProps) {
  const [showSummary, setShowSummary] = useState(false);

  return (
    <div
      className="col-span-3 my-2"
      data-testid="compaction-divider"
      data-message-index={messageIndex}
    >
      <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
        <div className="flex-1 border-t border-zinc-200 dark:border-zinc-700" />
        <span>🗜 Conversation compacted</span>
        <button
          onClick={() => setShowSummary((v) => !v)}
          className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          {showSummary ? "hide summary" : "view summary"}
        </button>
        {canUndo && onUndo && (
          <button
            onClick={onUndo}
            className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            undo
          </button>
        )}
        <div className="flex-1 border-t border-zinc-200 dark:border-zinc-700" />
      </div>
      {showSummary && (
        <div className="mt-2 rounded bg-zinc-50 dark:bg-zinc-800 p-3 text-sm">
          <SafeMarkdown content={summary} />
        </div>
      )}
    </div>
  );
}
