// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DisclosureChevron } from "#webui/components/chat/controls/header/HeaderIcons";
import {
  sanitizeMarkdown,
  sanitizeMarkdownInline,
} from "#webui/lib/utils/sanitize-markdown";

interface AssistantThoughtProps {
  content: string;
  isOpen?: boolean;
  isResponding?: boolean;
}

const baseClasses =
  "p-2 text-xs bg-zinc-200/70 dark:bg-zinc-700 rounded-lg border-l-3 border-emerald-500";

/**
 * Collapsible thought/reasoning display
 * @param {AssistantThoughtProps} root0 - Component props
 * @param {string} root0.content - Thought content
 * @param {boolean} [root0.isOpen] - Whether thought is expanded
 * @param {boolean} [root0.isResponding] - Whether assistant is currently responding
 * @returns {JSX.Element} - React component
 */
export function AssistantThought({
  content,
  isOpen,
  isResponding,
}: AssistantThoughtProps) {
  const trimmed = content.trim();
  // split always returns ≥1 element
  const firstLine = trimmed.split("\n")[0] as string;

  // Active thinking — disclosure open with pulse animation
  if (isOpen) {
    return (
      <details
        className={`disclosure ${baseClasses}${isResponding ? " animate-pulse" : ""}`}
        open
      >
        <summary className="font-semibold truncate flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
          <DisclosureChevron />
          💭 Thinking...
        </summary>
        <div
          className="pt-2 text-xs prose dark:prose-invert prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizeMarkdown(trimmed) }}
        />
      </details>
    );
  }

  // Completed thought — summary swaps content via group-open
  return (
    <details className={`disclosure group ${baseClasses}`}>
      <summary className="font-semibold truncate flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
        <DisclosureChevron />
        <span
          className="group-open:hidden"
          dangerouslySetInnerHTML={{
            __html: sanitizeMarkdownInline(`💭 ${firstLine}`),
          }}
        />
        <span className="hidden group-open:inline">💭</span>
      </summary>
      <div
        className="pt-2 text-xs prose dark:prose-invert prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeMarkdown(trimmed) }}
      />
    </details>
  );
}
