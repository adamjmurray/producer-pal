// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

interface AssistantErrorProps {
  content: string;
}

/**
 * Displays error message in red box
 * @param {AssistantErrorProps} root0 - Component props
 * @param {string} root0.content - Error message content
 * @returns {JSX.Element} - React component
 */
export function AssistantError({ content }: AssistantErrorProps) {
  return (
    <div className="rounded border-l-4 border-red-600 bg-red-100 p-3 text-red-900 dark:border-red-400 dark:bg-red-900 dark:text-red-100">
      <div className="mb-1 text-sm font-semibold">Error</div>
      <div className="text-sm whitespace-pre-wrap">{content}</div>
    </div>
  );
}
