// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { marked } from "marked";

interface AssistantThoughtProps {
  content: string;
  isOpen?: boolean;
  isResponding?: boolean;
}

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
  return (
    <details
      className={`p-2 text-xs bg-gray-200 dark:bg-gray-700 rounded border-l-3 border-green-500 ${
        isOpen && isResponding ? "animate-pulse" : ""
      }`}
      open={isOpen}
    >
      <summary
        className="font-semibold truncate"
        dangerouslySetInnerHTML={{
          __html: isOpen
            ? "💭 Thinking..."
            : (marked.parseInline(
                `💭 Thought about: ${content.trim().split("\n")[0]}`,
              ) as string),
        }}
      />
      <div
        className="pt-2 text-xs prose dark:prose-invert prose-sm max-w-none"
        dangerouslySetInnerHTML={{
          __html: (isOpen
            ? marked(content.trim())
            : marked(content.trim().split("\n").slice(1).join("\n"))) as string,
        }}
      />
    </details>
  );
}
