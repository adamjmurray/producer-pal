// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { marked } from "marked";

interface AssistantThoughtProps {
  content: string;
  isOpen?: boolean;
  isResponding?: boolean;
}

const baseClasses =
  "p-2 text-xs bg-gray-200 dark:bg-gray-700 rounded border-l-3 border-green-500";

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
        className={`${baseClasses}${isResponding ? " animate-pulse" : ""}`}
        open
      >
        <summary className="font-semibold truncate">💭 Thinking...</summary>
        <div
          className="pt-2 text-xs prose dark:prose-invert prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: marked(trimmed) as string }}
        />
      </details>
    );
  }

  // Completed thought — summary swaps content via group-open
  return (
    <details className={`group ${baseClasses}`}>
      <summary className="font-semibold truncate">
        <span
          className="group-open:hidden"
          dangerouslySetInnerHTML={{
            __html: marked.parseInline(
              `💭 Thought about: ${firstLine}`,
            ) as string,
          }}
        />
        <span className="hidden group-open:inline">💭 Thought about:</span>
      </summary>
      <div
        className="pt-2 text-xs prose dark:prose-invert prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: marked(trimmed) as string }}
      />
    </details>
  );
}
