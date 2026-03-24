// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { sanitizeMarkdown } from "#webui/lib/utils/sanitize-markdown";

/**
 * Renders markdown inside its own component so ErrorBoundary can catch throws.
 * @param props - Component props
 * @param props.content - Markdown string to render
 * @returns Rendered markdown element
 */
export function SafeMarkdown({ content }: { content: string }) {
  return (
    <div
      className="prose dark:prose-invert prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: sanitizeMarkdown(content) }}
    />
  );
}

/**
 * Fallback shown when a message fails to render.
 * @returns Error fallback element
 */
export function RenderErrorFallback() {
  return (
    <div className="p-3 text-sm text-red-600 dark:text-red-400">
      Failed to render this message
    </div>
  );
}
